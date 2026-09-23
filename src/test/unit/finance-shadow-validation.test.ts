/**
 * Offline Finance shadow validation — fixtures only (no Production).
 */

import { describe, expect, it } from "vitest";
import {
  mapFinancialSettlementDoc,
  mapOrderToTripFinancialSnapshot,
  ProductionFinanceReadAdapter,
} from "@/adapters/finance/ProductionFinanceReadAdapter";
import {
  FIXTURE_CARD_ORDER,
  FIXTURE_CASH_ORDER,
  FIXTURE_MISSING_MAJOR_ORDER,
  FIXTURE_V2_SETTLEMENT,
} from "@/test/fixtures/finance/financeFixtures";
import { runFinanceShadowOnDocuments } from "@/application/finance/shadow/FinanceShadowOrchestrator";
import {
  validateOrderFinanceShadow,
  validateSettlementFinanceShadow,
} from "@/application/finance/shadow/FinanceShadowValidator";
import { isPhaseFinanceShadowEnabled } from "@/domain/finance/shadow/isPhaseFinanceShadowEnabled";
import { assertFinanceShadowReportSafe } from "@/domain/finance/shadow/financeShadowPii";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

describe("Finance shadow gate + PII", () => {
  it("skips unless PHASE_FINANCE_SHADOW=1", () => {
    expect(isPhaseFinanceShadowEnabled(undefined)).toBe(false);
    expect(isPhaseFinanceShadowEnabled("0")).toBe(false);
    expect(isPhaseFinanceShadowEnabled("1")).toBe(true);
  });

  it("keeps FINANCE_WRITE_ENABLED false", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
  });

  it("rejects PII patterns in reports", () => {
    expect(assertFinanceShadowReportSafe('{"ok":true}').piiViolations).toBe(0);
    expect(
      assertFinanceShadowReportSafe('{"phone":"9665"}').piiViolations,
    ).toBeGreaterThan(0);
  });
});

describe("F2 mapping fixes proven by shadow (status_code / refs / settlement)", () => {
  it("maps status_code=completed → lifecycleCompleted", () => {
    const snap = mapOrderToTripFinancialSnapshot({
      documentId: "ord_sc",
      data: {
        status_code: "completed",
        currency: "SAR",
        total_mndob2: 50,
        total: 50,
        total_app: 7.5,
        total_vat: 0,
        total_mndob: 42.5,
        PaymentMethod: "Cash",
        payment_status: "cash_collected",
        mndob_user: { path: "user/drv_abc" },
        countryRef: { path: "countries/saudi_arabia" },
        agent_id: "agt_1",
        agent_amount_minor: 38,
      },
    });
    expect(snap.majors.lifecycleCompleted).toBe(true);
    expect(snap.driverId).toBe("drv_abc");
    expect(snap.countryId).toBe("saudi_arabia");
  });

  it("does not invent settlement currency; maps absoluteSettlementAmountMinor", () => {
    const mapped = mapFinancialSettlementDoc({
      documentId: "set_prod",
      data: {
        status: "settled",
        driverId: "drv_1",
        countryId: "countries/saudi_arabia",
        absoluteSettlementAmountMinor: 750,
        paidConfirmedMinor: 750,
        periodStart: "2020-01-01T00:00:00.000Z",
        periodEnd: "2030-01-01T00:00:00.000Z",
        eligibleOrderIds: ["ord_a"],
        direction: "DRIVER_PAYS_COMPANY",
        idempotencyKey: "k1",
      },
    });
    expect(mapped.currency).toBe("");
    expect(mapped.amountMinor).toBe(750n);
    expect(mapped.partyId).toBe("drv_1");
    expect(mapped.claims[0]?.orderId).toBe("ord_a");
    expect(mapped.periodFromUtc).toBe("2020-01-01T00:00:00.000Z");
  });
});

describe("Finance shadow offline aggregate", () => {
  it("validates fixtures and isolates FC policy blockers", () => {
    const summary = runFinanceShadowOnDocuments({
      mode: "offline_fixture",
      orders: [
        {
          ...FIXTURE_CASH_ORDER,
          data: { ...FIXTURE_CASH_ORDER.data, status_code: "completed" },
        },
        {
          ...FIXTURE_CARD_ORDER,
          data: { ...FIXTURE_CARD_ORDER.data, status_code: "completed" },
        },
        FIXTURE_MISSING_MAJOR_ORDER,
      ],
      settlements: [FIXTURE_V2_SETTLEMENT],
      countriesWithMultipleActiveAgents: 0,
    });

    expect(summary.productionWrites).toBe(0);
    expect(summary.financeWriteEnabled).toBe(false);
    expect(summary.ordersScanned).toBe(3);
    expect(summary.settlementsScanned).toBe(1);
    expect(summary.policyBlockedByFc["FC-01"]).toBe(0);
    expect(summary.policyBlockedByFc["FC-04"]).toBe(0);
    expect(summary.policyBlockedByFc["FC-05"]).toBe(0);
    expect(summary.mismatchesByCategory.MAPPING_ERROR).toBe(0);
    expect(summary.mismatchesByCategory.CALCULATION_ERROR).toBe(0);
    expect(summary.overallStatus).toBe("SHADOW_PASS");
    expect(summary.controlledFinanceRolloutPrep).toBe("GO");
    expect(summary.piiViolations).toBe(0);
  });

  it("never attributes current country agent", () => {
    const adapter = new ProductionFinanceReadAdapter();
    const findings = validateOrderFinanceShadow(
      {
        order: {
          documentId: "ord_no_agent",
          data: {
            status_code: "completed",
            currency: "SAR",
            total_mndob2: 50,
            total: 50,
            total_app: 7.5,
            total_vat: 0,
            total_mndob: 42.5,
            PaymentMethod: "Cash",
            payment_status: "cash_collected",
          },
          currentCountryAgentId: "agent_should_never_apply",
        },
      },
      adapter,
    );
    expect(
      findings.some(
        (f) => f.code === "current_country_agent_incorrectly_attributed",
      ),
    ).toBe(false);
    expect(
      findings.some((f) => f.code === "agent_unknown_historical"),
    ).toBe(true);
  });

  it("marks settlement party mapping clean for V2 fixture", () => {
    const findings = validateSettlementFinanceShadow(FIXTURE_V2_SETTLEMENT);
    expect(findings.some((f) => f.code === "settlement_party_mapped")).toBe(
      true,
    );
  });
});
