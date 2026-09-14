/**
 * FC-01 APPROVED 15% + FR1 pilot preparation gates (offline).
 * FINANCE_WRITE_ENABLED remains false. Production writes = 0.
 */

import { describe, expect, it } from "vitest";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { percentOfMinorHalfUp } from "@/domain/finance/v2/CalculationPipeline";
import {
  FINANCE_POLICY_UNRESOLVED_FC01,
  isFinancePolicyUnresolvedFc01,
} from "@/domain/finance/v2/policies/FinancePolicyCodes";
import {
  createOfflineApprovedCommissionRateFixture,
  FC01_LOCK_STATUS,
  historicalPlatformCommissionAmountOnly,
  LEGACY_PLATFORM_COMMISSION_15_PERCENT_EVIDENCE,
  PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT,
  PLATFORM_COMMISSION_POLICY_CONFIG_REQUIRED,
  requireApprovedPlatformCommissionRate,
  requireFc01ApprovedPlatformCommissionRate,
  resolveActivePlatformCommissionPolicy,
} from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  f6PolicyClosureSummary,
  FINANCE_POLICY_REGISTRY_F6,
  isFinancePolicyApproved,
} from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import {
  classifyFinanceFr1Trip,
  selectOneSafeSyntheticFinanceFr1Candidate,
} from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import {
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_EXPECTED_WRITE_COUNTS,
  FINANCE_FR1_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  assertFinanceFr1PrepWriteDisabled,
  evaluateFinanceFr1LiveArmGates,
} from "@/application/finance/pilot/FinanceFr1PilotGates";
import { prepareFinanceFr1Pilot } from "@/application/finance/pilot/FinanceFr1PilotPreparation";
import { runFinanceFr1PilotApply } from "@/application/finance/pilot/FinanceFr1PilotApply";
import { isFinanceFr1PilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr1PilotApplyEnabled";
import { FINANCE_FR1_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr1PilotIamDerivation";
import { buildFinanceControlledRolloutPreparationStatus } from "@/application/finance/rollout/FinanceControlledRolloutHarness";

describe("FC-01 APPROVED 15% versioned config", () => {
  it("keeps FINANCE_WRITE_ENABLED false", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
  });

  it("locks FC-01 APPROVED at 15% via versioned policy", () => {
    expect(FC01_LOCK_STATUS).toBe("APPROVED");
    expect(isFinancePolicyApproved("FC-01")).toBe(true);
    expect(PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.status).toBe(
      "approved",
    );
    expect(PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.ratePercent).toBe(15);
    expect(PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.productionApproved).toBe(
      true,
    );
    expect(PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.rateSource).toBe(
      "versioned_config",
    );
    expect(
      PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.ratePercent,
    ).toBe(LEGACY_PLATFORM_COMMISSION_15_PERCENT_EVIDENCE.ratePercent);
    expect(FINANCE_POLICY_REGISTRY_F6["FC-01"].productionWriteReady).toBe(false);
    expect(f6PolicyClosureSummary().fc01).toBe("APPROVED");
    expect(f6PolicyClosureSummary().remainingBlockers).not.toContain(
      "FC-01_CONFIG_REQUIRED",
    );
  });

  it("resolves approved 15% and still fail-closes missing config", () => {
    expect(
      requireFc01ApprovedPlatformCommissionRate({
        asOfUtc: "2026-09-13T21:00:00.000Z",
      }),
    ).toBe(15);
    expect(
      requireApprovedPlatformCommissionRate(
        PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT,
        { asOfUtc: "2026-09-13T21:00:00.000Z" },
      ),
    ).toBe(15);

    expect(() =>
      requireApprovedPlatformCommissionRate(
        PLATFORM_COMMISSION_POLICY_CONFIG_REQUIRED,
      ),
    ).toThrow(FINANCE_POLICY_UNRESOLVED_FC01);

    expect(() => requireApprovedPlatformCommissionRate(null)).toThrow(
      FINANCE_POLICY_UNRESOLVED_FC01,
    );

    try {
      requireApprovedPlatformCommissionRate(null);
    } catch (e) {
      expect(isFinancePolicyUnresolvedFc01(e)).toBe(true);
    }

    // Before effective date → fail closed
    expect(
      resolveActivePlatformCommissionPolicy({
        asOfUtc: "2026-09-12T00:00:00.000Z",
      }),
    ).toBeNull();
    expect(() =>
      requireFc01ApprovedPlatformCommissionRate({
        asOfUtc: "2026-09-12T00:00:00.000Z",
      }),
    ).toThrow(/not_effective_as_of/);

    const fixture = createOfflineApprovedCommissionRateFixture({
      ratePercent: 12,
    });
    expect(
      requireApprovedPlatformCommissionRate(fixture, {
        allowOfflineFixture: true,
      }),
    ).toBe(12);
  });

  it("never re-rates historical amounts from policy percent", () => {
    const hist = historicalPlatformCommissionAmountOnly();
    expect(hist.usesPersistedAmount).toBe(true);
    expect(hist.ratePercent).toBeNull();
    expect(hist.historicalReRateForbidden).toBe(true);
    // Half-up precision lock for NEW calcs only
    expect(percentOfMinorHalfUp(10000n, 15)).toBe(1500n);
    expect(percentOfMinorHalfUp(10001n, 15)).toBe(1500n);
    expect(percentOfMinorHalfUp(10003n, 15)).toBe(1500n);
    expect(percentOfMinorHalfUp(10004n, 15)).toBe(1501n);
  });
});

describe("FR1 pilot preparation gates", () => {
  const syntheticOrder = {
    documentId: "test_finance_fr1_completed_001",
    data: {
      synthetic: true,
      status_code: "completed",
      currency: "SAR",
      country_id: "SA",
      total_mndob2: 100,
      total: 100,
      total_app: 15,
      total_vat: 0,
      total_mndob: 85,
      payment_method: "cash",
      payment_status: "cash_collected",
      PaymentMethod: "Cash",
    },
  };

  it("defaults harness SKIP and refuses prep writes", () => {
    expect(isFinanceFr1PilotApplyEnabled(undefined)).toBe(false);
    expect(isFinanceFr1PilotApplyEnabled("1")).toBe(true);
    expect(() => assertFinanceFr1PrepWriteDisabled({ FINANCE_WRITE_ENABLED: "false" })).not.toThrow();
    expect(() =>
      assertFinanceFr1PrepWriteDisabled({ FINANCE_WRITE_ENABLED: "true" }),
    ).toThrow(/must remain false/);

    const gates = evaluateFinanceFr1LiveArmGates({
      env: { FINANCE_FR1_PILOT_APPLY: "1", FINANCE_WRITE_ENABLED: "false" },
      mode: "preparation",
    });
    expect(gates.allowed).toBe(false);
    expect(gates.expectedAdcPrincipal).toBe(FINANCE_FR1_EXPECTED_ADC_PRINCIPAL);
    expect(gates.projectId).toBe(FINANCE_FR1_EXPECTED_PROJECT_ID);
  });

  it("prefers synthetic candidate and NO-GO without one", () => {
    const none = prepareFinanceFr1Pilot({ orders: [] });
    expect(none.fc01Status).toBe("APPROVED_15_PERCENT");
    expect(none.pilotCandidateFound).toBe(false);
    expect(none.goNoGo).toBe("NO-GO");
    expect(none.productionWritesThisSession).toBe(0);
    expect(none.financeWriteEnabled).toBe(false);

    const realOnly = prepareFinanceFr1Pilot({
      orders: [
        {
          documentId: "real_order_abc",
          data: {
            status_code: "completed",
            currency: "SAR",
            total_mndob2: 50,
            total: 50,
            total_app: 7.5,
            total_vat: 0,
            total_mndob: 42.5,
            payment_method: "cash",
            payment_status: "cash_collected",
          },
        },
      ],
    });
    expect(realOnly.pilotCandidateFound).toBe(false);
    expect(realOnly.goNoGo).toBe("NO-GO");
    expect(
      classifyFinanceFr1Trip({
        documentId: "real_order_abc",
        data: { status_code: "completed" },
      }),
    ).toBe("unknown");
  });

  it("selects one synthetic trip and exposes exact snapshot + writes", () => {
    expect(selectOneSafeSyntheticFinanceFr1Candidate([syntheticOrder])?.documentId).toBe(
      syntheticOrder.documentId,
    );
    expect(classifyFinanceFr1Trip(syntheticOrder)).toBe("synthetic_test");

    const prep = prepareFinanceFr1Pilot({
      orders: [syntheticOrder],
      actorPermissions: ["finance:read", "settlements:prepare"],
      discountFundingOwner: "company",
      priorSnapshotExists: false,
      asOfUtc: "2026-09-13T21:00:00.000Z",
    });

    expect(prep.fc01Status).toBe("APPROVED_15_PERCENT");
    expect(prep.fc01RatePercent).toBe(15);
    expect(prep.pilotCandidateFound).toBe(true);
    expect(prep.pilotTripClassification).toBe("synthetic_test");
    expect(prep.calculatedSnapshot).not.toBeNull();
    expect(prep.calculatedSnapshot!.commissionRatePercent).toBe(15);
    expect(prep.calculatedSnapshot!.grossFareMinor).toBe("10000");
    expect(prep.calculatedSnapshot!.commissionAmountPersistedMinor).toBe("1500");
    expect(prep.calculatedSnapshot!.commissionAmountFromApprovedRateMinor).toBe(
      "1500",
    );
    expect(prep.calculatedSnapshot!.driverNetMinor).toBe("8500");
    expect(prep.calculatedSnapshot!.currency).toBe("SAR");
    expect(prep.calculatedSnapshot!.paymentMethod).toBe("cash");
    expect(prep.calculatedSnapshot!.settlementDirection).toBe(
      "DRIVER_PAYS_COMPANY",
    );
    expect(prep.calculatedSnapshot!.mutatesOrderMajors).toBe(false);
    expect(prep.exactExpectedWrites).toEqual(FINANCE_FR1_EXPECTED_WRITE_COUNTS);
    expect(prep.exactExpectedWrites.order).toBe(0);
    expect(prep.exactExpectedWrites.drivers).toBe(0);
    expect(prep.requiredIamPermissions).toEqual(
      FINANCE_FR1_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    );
    expect(prep.expectedAdcPrincipal).toBe(FINANCE_FR1_EXPECTED_ADC_PRINCIPAL);
    expect(prep.prepChecklistPassCount).toBe(14);
    expect(prep.goNoGo).toBe("GO");
    expect(prep.productionWritesThisSession).toBe(0);
    expect(prep.oneShotLiveCommand).toContain("FINANCE_FR1_PILOT_APPLY=1");
    expect(prep.oneShotLiveCommand).toContain("FINANCE_FR1_REGISTRY_PILOT=1");
    expect(prep.oneShotLiveCommand).toContain("FINANCE_WRITE_ENABLED=true");
    expect(prep.oneShotLiveCommand).toContain("SOURCE=registry");
    expect(prep.cleanupCommand).toContain("FINANCE_WRITE_ENABLED=false");
  });

  it("refuses live apply in preparation mode with 0 writes", async () => {
    const r = await runFinanceFr1PilotApply({ mode: "preparation" });
    expect(r.status).toBe("REFUSED_PREP");
    expect(r.productionWrites).toBe(0);
    expect(r.writeCounts).toEqual(FINANCE_FR1_ZERO_WRITE_COUNTS);
  });

  it("rollout harness no longer blocks on FC-01_CONFIG_REQUIRED", () => {
    const status = buildFinanceControlledRolloutPreparationStatus();
    expect(status.f6.fc01).toBe("APPROVED");
    expect(status.remainingBlockers).not.toContain("FC-01_CONFIG_REQUIRED");
    expect(status.productionWrites).toBe(0);
    expect(status.financeWriteEnabled).toBe(false);
  });

  it("calculator builds snapshot from synthetic order", () => {
    const snap = calculateFinanceFr1PilotSnapshot({
      order: syntheticOrder,
      actorUserId: "actor_1",
      discountFundingOwner: "company",
      asOfUtc: "2026-09-13T21:00:00.000Z",
    });
    expect(snap.commissionRatePercent).toBe(15);
    expect(snap.reconciliationStatus).toBe("preconditions_ok");
    expect(snap.historicalReRateForbidden).toBe(true);
  });
});
