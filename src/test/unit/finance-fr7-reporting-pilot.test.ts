/**
 * FR7 Finance Reporting / Read Models — offline unit tests.
 * Production writes = 0. Does not modify FR1–FR6.
 */

import { describe, expect, it } from "vitest";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import type { FinanceReportingActor } from "@/application/finance/reporting/FinanceReportingScope";
import {
  adjustmentHasMonetaryEffect,
  signedCompanyClaimImpactMinor,
} from "@/domain/finance/reporting/FinanceAdjustmentMonetarySemantics";
import {
  assertHistoricalCommissionNotRerated,
  buildDashboardSummary,
} from "@/domain/finance/reporting/FinanceReportingAggregator";
import type { FinanceReportingSourceBundle } from "@/domain/finance/reporting/FinanceReportingTypes";
import { prepareFinanceFr7ReportingPilot } from "@/application/finance/pilot/FinanceFr7PilotPreparation";
import { verifyFinanceFr7GoldenReporting } from "@/application/finance/pilot/FinanceFr7PilotCalculator";
import {
  buildFinanceFr7GoldenSourceBundle,
  FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT,
} from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import {
  evaluateFinanceFr7LiveVerifyGates,
  isFinanceFr7ReportingPilotVerifyEnabled,
} from "@/application/finance/pilot/FinanceFr7PilotGates";
import {
  FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS,
  FINANCE_FR7_PERSISTENCE_MODE,
  FINANCE_FR7_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr7PilotConstants";
import {
  FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES,
} from "@/application/finance/pilot/FinanceFr7PilotIamDerivation";
import { FR7_REPORTING_READ_SPEC } from "@/application/finance/rollout/FinanceRolloutOperationSpecs";
import { FINANCE_FR2_COUNTRY_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { ROLE_PERMISSION_MATRIX, hasPermission } from "@/permissions/rbac";

const GLOBAL_ACTOR: FinanceReportingActor = {
  userId: "acct1",
  role: "accountant",
  permissions: ["finance:read", "reports:export"],
  scope: { type: "global" },
};

function cloneGolden(
  mutate?: (b: FinanceReportingSourceBundle) => void,
): FinanceReportingSourceBundle {
  const b = buildFinanceFr7GoldenSourceBundle();
  mutate?.(b);
  return b;
}

describe("Finance FR7 Reporting / Read Models (offline)", () => {
  it("keeps FINANCE_WRITE_ENABLED false and Production writes = 0", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const prep = prepareFinanceFr7ReportingPilot();
    expect(prep.financeWriteEnabled).toBe(false);
    expect(prep.productionWritesThisSession).toBe(0);
    expect(prep.persistenceMode).toBe("read_only_computed_models");
    expect(prep.writeHarnessRequired).toBe(false);
    expect(prep.fr7PrepStatus).toBe("PASS");
    expect(prep.goNoGo).toBe("GO");
    expect(FINANCE_FR7_ZERO_WRITE_COUNTS.totalProductionWrites).toBe(0);
    expect(FR7_REPORTING_READ_SPEC.expectedWriteCounts.production).toBe(0);
  });

  it("locks golden synthetic SAR totals and recon PASS", () => {
    const v = verifyFinanceFr7GoldenReporting({ useOfflineFixture: true });
    expect(v.reportingStatus).toBe("PASS");
    expect(v.currency).toBe("SAR");
    expect(v.grossFareMinor).toBe("10000");
    expect(v.companyCommissionMinor).toBe("1500");
    expect(v.driverNetMinor).toBe("8500");
    expect(v.settlementAmountMinor).toBe("1500");
    expect(v.paidConfirmedMinor).toBe("1500");
    expect(v.outstandingMinor).toBe("0");
    expect(v.settlementStatus).toBe("settled");
    expect(v.reconciliationStatus).toBe("PASS");
    expect(v.productionWrites).toBe(0);
  });

  it("treats FR6 neutral_memo as non-monetary (amount visible, impact 0)", () => {
    expect(adjustmentHasMonetaryEffect("neutral_memo")).toBe(false);
    expect(
      signedCompanyClaimImpactMinor({
        direction: "neutral_memo",
        amountMinor: 25n,
        status: "approved",
      }),
    ).toBe(0n);
    expect(FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT.monetaryEffect).toBe(false);
    expect(FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT.signedCompanyClaimImpactMinor).toBe(
      "0",
    );
    const v = verifyFinanceFr7GoldenReporting({ useOfflineFixture: true });
    expect(v.fr6AdjustmentMonetaryEffect).toBe(false);
    expect(v.fr6SignedCompanyClaimImpactMinor).toBe("0");
    expect(v.fr6AmountPersistedMinor).toBe("25");
    expect(v.monetaryTotalsUnchangedByMemo).toBe(true);
  });

  it("covers settled / unpaid / partially paid settlement chains", () => {
    const settled = new FinanceReportingReadService(
      buildFinanceFr7GoldenSourceBundle(),
    );
    expect(settled.settlements(GLOBAL_ACTOR)[0].outstandingMinor).toBe("0");

    const unpaid = new FinanceReportingReadService(
      buildFinanceFr7GoldenSourceBundle({
        settlementStatus: "locked",
        paidConfirmedMinor: 0n,
        includeFr6Adjustment: false,
      }),
    );
    const u = unpaid.settlements(GLOBAL_ACTOR)[0];
    expect(u.paidConfirmedMinor).toBe("0");
    expect(u.outstandingMinor).toBe("1500");
    expect(u.status).toBe("locked");

    const partial = new FinanceReportingReadService(
      buildFinanceFr7GoldenSourceBundle({
        settlementStatus: "partially_paid",
        paidConfirmedMinor: 500n,
        includeFr6Adjustment: false,
      }),
    );
    const p = partial.settlements(GLOBAL_ACTOR)[0];
    expect(p.paidConfirmedMinor).toBe("500");
    expect(p.outstandingMinor).toBe("1000");
  });

  it("applies monetary adjustment / reversal / refund / chargeback / disputed / gateway fee", () => {
    const bundle = cloneGolden((b) => {
      b.adjustments = [
        {
          id: "adj_money",
          status: "approved",
          countryId: FINANCE_FR2_COUNTRY_ID,
          currency: "SAR",
          amountMinor: 100n,
          direction: "decrease_company_claim",
          relatedOrderId: b.snapshots[0].orderId,
          relatedSettlementId: b.settlements[0].id,
          createdAtUtc: "2026-09-14T02:00:00.000Z",
          approvedAtUtc: "2026-09-14T02:00:00.000Z",
        },
      ];
      b.payments.push({
        id: "pay_rev",
        settlementId: b.settlements[0].id,
        amountMinor: 200n,
        currency: "SAR",
        status: "reversed",
        createdAtUtc: "2026-09-14T02:10:00.000Z",
      });
      b.refunds.push({
        id: "ref1",
        kind: "customer_refund",
        relatedOrderId: b.snapshots[0].orderId,
        countryId: FINANCE_FR2_COUNTRY_ID,
        currency: "SAR",
        amountMinor: 50n,
        status: "recorded",
        createdAtUtc: "2026-09-14T02:20:00.000Z",
      });
      b.chargebacks.push({
        id: "cb1",
        relatedOrderId: b.snapshots[0].orderId,
        countryId: FINANCE_FR2_COUNTRY_ID,
        currency: "SAR",
        amountMinor: 75n,
        feeAmountMinor: 10n,
        status: "recorded",
        createdAtUtc: "2026-09-14T02:30:00.000Z",
      });
      b.chargebacks.push({
        id: "cb_disp",
        relatedOrderId: b.snapshots[0].orderId,
        countryId: FINANCE_FR2_COUNTRY_ID,
        currency: "SAR",
        amountMinor: 40n,
        feeAmountMinor: null,
        status: "disputed_suspense",
        createdAtUtc: "2026-09-14T02:40:00.000Z",
      });
      b.snapshots[0].gatewayFeeMinor = 15n;
    });
    const svc = new FinanceReportingReadService(bundle);
    const dash = svc.dashboard(GLOBAL_ACTOR);
    expect(dash.company.adjustmentsMonetary.amountMinor).toBe("-100");
    expect(dash.company.reversals.amountMinor).toBe("200");
    expect(dash.company.refunds.amountMinor).toBe("50");
    expect(dash.company.chargebacks.amountMinor).toBe("75");
    expect(dash.company.disputedSuspense.amountMinor).toBe("40");
    expect(dash.company.gatewayFees.amountMinor).toBe("15");
    const corr = svc.corrections(GLOBAL_ACTOR);
    expect(corr.some((c) => c.kind === "refund")).toBe(true);
    expect(corr.some((c) => c.kind === "chargeback")).toBe(true);
  });

  it("keeps unknown agent attribution unknown (never silent zero)", () => {
    const svc = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
    const country = svc.countrySummary(GLOBAL_ACTOR, FINANCE_FR2_COUNTRY_ID);
    expect(country.agent.attributionStatus).toBe("unknown_historical");
    expect(country.agent.collectedCash.amountMinor).toBeNull();
    expect(country.agent.collectedCash.availability).not.toBe("available");
    expect(country.agent.agentEntitlement.amountMinor).toBeNull();
  });

  it("never zero-fills missing financial fields", () => {
    const bundle = cloneGolden((b) => {
      b.snapshots[0].vatAmountMinor = null;
      b.snapshots[0].gatewayFeeMinor = null;
    });
    const dash = buildDashboardSummary({ bundle });
    expect(dash.company.vatTax.amountMinor).toBeNull();
    expect(dash.company.vatTax.availability).toBe("missing");
    expect(dash.company.gatewayFees.amountMinor).toBeNull();
  });

  it("groups by currency and never FX-merges", () => {
    const bundle = cloneGolden((b) => {
      b.snapshots.push({
        ...b.snapshots[0],
        id: "snap_usd",
        orderId: "order_usd",
        currency: "USD",
        grossFareMinor: 2000n,
        eligibleRevenueMinor: 2000n,
        commissionAmountPersistedMinor: 300n,
        driverNetMinor: 1700n,
        driverDeductionsMinor: 300n,
      });
    });
    const dash = buildDashboardSummary({ bundle });
    expect(dash.byCurrency.map((c) => c.currency).sort()).toEqual(["SAR", "USD"]);
    expect(dash.byCurrency.find((c) => c.currency === "USD")?.company.grossBookingValue.amountMinor).toBe(
      "2000",
    );
    expect(dash.company.grossBookingValue.amountMinor).toBe("10000");
  });

  it("supports date / country / agent / driver filters", () => {
    const svc = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
    const byCountry = svc.dashboard(GLOBAL_ACTOR, {
      countryId: FINANCE_FR2_COUNTRY_ID,
    });
    expect(byCountry.company.grossBookingValue.amountMinor).toBe("10000");
    const other = svc.dashboard(GLOBAL_ACTOR, { countryId: "russia" });
    expect(other.company.grossBookingValue.amountMinor).toBe("0");
    const byPeriod = svc.dashboard(GLOBAL_ACTOR, {
      periodFromUtc: "2026-09-13T00:00:00.000Z",
      periodToUtc: "2026-09-13T23:59:59.999Z",
    });
    expect(byPeriod.company.grossBookingValue.amountMinor).toBe("10000");
    const outOfPeriod = svc.dashboard(GLOBAL_ACTOR, {
      periodFromUtc: "2020-01-01T00:00:00.000Z",
      periodToUtc: "2020-01-02T00:00:00.000Z",
    });
    expect(outOfPeriod.company.grossBookingValue.amountMinor).toBe("0");
    const driverId = buildFinanceFr7GoldenSourceBundle().snapshots[0].driverId!;
    const drv = svc.driverSummary(GLOBAL_ACTOR, driverId);
    expect(drv.metrics.driverNet.amountMinor).toBe("8500");
  });

  it("enforces RBAC and cross-country denial", () => {
    const svc = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
    expect(() =>
      svc.dashboard({
        userId: "x",
        role: "support_agent",
        permissions: [],
        scope: { type: "global" },
      }),
    ).toThrow(/rbac_denied:finance:read/);

    const countryActor: FinanceReportingActor = {
      userId: "ca",
      role: "country_admin",
      permissions: ["finance:read"],
      scope: { type: "country", countryIds: [FINANCE_FR2_COUNTRY_ID] },
    };
    expect(svc.dashboard(countryActor).company.grossBookingValue.amountMinor).toBe(
      "10000",
    );
    expect(() => svc.countrySummary(countryActor, "russia")).toThrow(
      /cross_country_denied/,
    );

    expect(hasPermission(ROLE_PERMISSION_MATRIX.reporting_viewer, "finance:read")).toBe(
      true,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.auditor, "finance:read")).toBe(true);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.support_agent, "finance:read"),
    ).toBe(false);
  });

  it("masks PII in aggregate read models", () => {
    const svc = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
    const list = svc.settlements(GLOBAL_ACTOR);
    expect(list[0].partyIdToken).not.toContain("test_adminnext");
    expect(list[0].partyIdToken.length).toBe(16);
    const country = svc.countrySummary(GLOBAL_ACTOR, FINANCE_FR2_COUNTRY_ID);
    expect(country.meta.piiMasked).toBe(true);
  });

  it("does not recalculate historical 15% from current policy", () => {
    const check = assertHistoricalCommissionNotRerated({
      persistedCommissionMinor: 1500n,
      grossFareMinor: 10000n,
      currentPolicyRatePercent: 15,
    });
    expect(check.ok).toBe(true);
    // Different rate would recompute differently — reporting still uses persisted.
    const svc = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
    expect(svc.dashboard(GLOBAL_ACTOR).company.platformCommission.amountMinor).toBe(
      "1500",
    );
    expect(FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.companyCommissionMinor).toBe("1500");
  });

  it("does not double-count duplicate/idempotent source rows", () => {
    const bundle = cloneGolden((b) => {
      b.snapshots.push({ ...b.snapshots[0] });
      b.settlements.push({ ...b.settlements[0] });
      b.adjustments.push({ ...b.adjustments[0] });
    });
    const dash = buildDashboardSummary({ bundle });
    expect(dash.company.grossBookingValue.amountMinor).toBe("10000");
    expect(dash.settlementCount).toBe(1);
    expect(dash.company.adjustmentsMonetary.amountMinor).toBe("0");
  });

  it("separates cash vs card and one-country-one-active-agent", () => {
    const bundle = cloneGolden((b) => {
      b.snapshots.push({
        ...b.snapshots[0],
        id: "snap_card",
        orderId: "order_card",
        paymentMethod: "card",
        agentAttributionStatus: "snapshot",
        agentId: "agent_saudi_active_001",
        agentShareMinor: 0n,
      });
    });
    const dash = buildDashboardSummary({ bundle });
    expect(dash.company.collectedCash.amountMinor).toBe("10000");
    expect(dash.company.electronicCardReceipts.amountMinor).toBe("10000");
    const country = new FinanceReportingReadService(bundle).countrySummary(
      GLOBAL_ACTOR,
      FINANCE_FR2_COUNTRY_ID,
    );
    expect(country.activeAgentInvariant).toBe("pass");
  });

  it("requires finance:read and reports:export for export source", () => {
    const svc = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
    expect(() =>
      svc.exportSource(
        {
          userId: "a",
          role: "auditor",
          permissions: ["finance:read"],
          scope: { type: "global" },
        },
        "finance_dashboard",
      ),
    ).toThrow(/rbac_denied:reports:export/);
    const csv = svc.exportCsv(GLOBAL_ACTOR, "finance_dashboard");
    expect(csv.split("\n")[0]).toContain("metric");
  });

  it("locks IAM + gates for read-only live verify", () => {
    expect(FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS).toEqual([
      "datastore.entities.get",
      "firebaseauth.users.get",
    ]);
    expect(FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES).toEqual([]);
    expect(isFinanceFr7ReportingPilotVerifyEnabled(undefined)).toBe(false);
    expect(FINANCE_FR7_PERSISTENCE_MODE).toBe("read_only_computed_models");
    const prepGates = evaluateFinanceFr7LiveVerifyGates({
      env: { FINANCE_WRITE_ENABLED: "false" },
      mode: "preparation",
    });
    expect(prepGates.allowed).toBe(false);
    const live = evaluateFinanceFr7LiveVerifyGates({
      env: {
        FINANCE_FR7_REPORTING_PILOT_VERIFY: "1",
        FINANCE_WRITE_ENABLED: "false",
        GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
        PRODUCTION_WRITE_ENABLED: "false",
        DRIVER_WRITE_ENABLED: "false",
        AGENT_WRITE_ENABLED: "false",
        CUSTOMER_WRITE_ENABLED: "false",
        EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
        GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
        SOURCE: "fr1_fr6_read_only",
      },
      mode: "live_verify",
    });
    expect(live.allowed).toBe(true);
    expect(live.expectedWrites.totalProductionWrites).toBe(0);
  });

  it("denies live verify when any write flag is armed", () => {
    const live = evaluateFinanceFr7LiveVerifyGates({
      env: {
        FINANCE_FR7_REPORTING_PILOT_VERIFY: "1",
        FINANCE_WRITE_ENABLED: "true",
        EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
        GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
        SOURCE: "fr1_fr6_read_only",
      },
      mode: "live_verify",
    });
    expect(live.allowed).toBe(false);
    expect(live.blockers).toContain(
      "FINANCE_WRITE_ENABLED_must_be_false_for_read_only_fr7",
    );
  });
});
