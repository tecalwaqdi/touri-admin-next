/**
 * Trip finance display / settlement exclusion state.
 * Historical incomplete or arithmetic conflict must never enter certified totals.
 */

import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { detectMajorInconsistency } from "@/application/finance/materialize/AccountingSnapshotMaterializeService";
import { evaluateCertifiedAccountingSnapshotEligibility } from "@/domain/finance/v2/CertifiedSnapshotEligibility";
import type { CanonicalMoneyField } from "@/domain/canonical/CanonicalReadModels";

export type TripFinanceDisplayState =
  | "certified_ready"
  | "certified_snapshotted"
  | "pending_uncollected"
  | "historical_incomplete"
  | "historical_conflict"
  | "not_applicable";

export type TripFinanceDisplayClassification = {
  state: TripFinanceDisplayState;
  /** Machine reasons — never invent money. */
  reasons: string[];
  /** Exclude from certified revenue / Settlement V2. */
  excludeFromCertifiedTotals: boolean;
  /** Exclude from Settlement V2 eligibility. */
  excludeFromSettlementV2: boolean;
  /** Presentation key for operator UI (i18n). */
  presentationKey:
    | "historicalFinancialIncomplete"
    | "historicalFinancialConflict"
    | "pendingUncollected"
    | "certifiedAccounting"
    | null;
};

function moneyMajorPresent(field: CanonicalMoneyField | null | undefined): boolean {
  return (
    field != null &&
    (field.availabilityStatus === "available" ||
      field.availabilityStatus === undefined) &&
    typeof field.value === "number" &&
    Number.isFinite(field.value)
  );
}

function moneyToMinorString(
  field: CanonicalMoneyField | null | undefined,
): string | null {
  if (!moneyMajorPresent(field) || typeof field!.value !== "number") return null;
  return String(Math.round(field!.value * 100));
}

/**
 * Classify from CanonicalTrip financialSafeRead (no raw order required).
 */
export function classifyTripFinanceDisplayFromSafeRead(input: {
  lifecycleCompleted: boolean;
  paymentChannel: "cash" | "card" | "unknown";
  paymentStatus: string | null;
  financialSafeRead: {
    totalApp: CanonicalMoneyField;
    totalVat: CanonicalMoneyField;
    totalMndob: CanonicalMoneyField;
    totalMndob2: CanonicalMoneyField;
  };
  snapshotExists?: boolean;
}): TripFinanceDisplayClassification {
  const gross = moneyToMinorString(input.financialSafeRead.totalMndob2);
  const commission = moneyToMinorString(input.financialSafeRead.totalApp);
  const vat = moneyToMinorString(input.financialSafeRead.totalVat);
  const driverNet = moneyToMinorString(input.financialSafeRead.totalMndob);

  if (gross != null && commission != null && vat != null && driverNet != null) {
    const expected = BigInt(gross) - BigInt(commission) - BigInt(vat);
    if (expected !== BigInt(driverNet)) {
      return {
        state: "historical_conflict",
        reasons: [
          `majors_inconsistent:expected_driverNet=${expected.toString()}_got=${driverNet}`,
        ],
        excludeFromCertifiedTotals: true,
        excludeFromSettlementV2: true,
        presentationKey: "historicalFinancialConflict",
      };
    }
  }

  if (input.snapshotExists) {
    return {
      state: "certified_snapshotted",
      reasons: ["finance_accounting_snapshot_exists"],
      excludeFromCertifiedTotals: false,
      excludeFromSettlementV2: false,
      presentationKey: "certifiedAccounting",
    };
  }

  const missing: string[] = [];
  if (!moneyMajorPresent(input.financialSafeRead.totalMndob2))
    missing.push("gross_fare_missing");
  if (!moneyMajorPresent(input.financialSafeRead.totalApp))
    missing.push("platform_commission_persisted_missing");
  if (!moneyMajorPresent(input.financialSafeRead.totalVat))
    missing.push("vat_missing");
  if (!moneyMajorPresent(input.financialSafeRead.totalMndob))
    missing.push("driver_net_missing");

  if (missing.length > 0) {
    return {
      state: "historical_incomplete",
      reasons: missing,
      excludeFromCertifiedTotals: true,
      excludeFromSettlementV2: true,
      presentationKey: "historicalFinancialIncomplete",
    };
  }

  const eligibility = evaluateCertifiedAccountingSnapshotEligibility({
    lifecycleStatus: input.lifecycleCompleted ? "completed" : "unmapped",
    lifecycleCompleted: input.lifecycleCompleted,
    paymentChannel: input.paymentChannel,
    paymentStatus: input.paymentStatus ?? "unknown",
  });

  if (!eligibility.eligible) {
    return {
      state: "pending_uncollected",
      reasons: eligibility.blockers,
      excludeFromCertifiedTotals: true,
      excludeFromSettlementV2: true,
      presentationKey: "pendingUncollected",
    };
  }

  return {
    state: "certified_ready",
    reasons: ["preconditions_ok", eligibility.trigger],
    excludeFromCertifiedTotals: false,
    excludeFromSettlementV2: false,
    presentationKey: "certifiedAccounting",
  };
}

/**
 * Classify a trip for Admin Finance / Trips display from order document.
 * Does not mutate; does not invent zeros.
 */
export function classifyTripFinanceDisplayState(input: {
  orderId: string;
  data: Record<string, unknown>;
  snapshotExists?: boolean;
}): TripFinanceDisplayClassification {
  const calculated = calculateFinanceFr1PilotSnapshot({
    order: { documentId: input.orderId, data: input.data },
    actorUserId: "trip_finance_display_classify",
  });

  const inconsistent = detectMajorInconsistency(calculated);
  if (inconsistent.length > 0) {
    return {
      state: "historical_conflict",
      reasons: inconsistent,
      excludeFromCertifiedTotals: true,
      excludeFromSettlementV2: true,
      presentationKey: "historicalFinancialConflict",
    };
  }

  if (input.snapshotExists) {
    return {
      state: "certified_snapshotted",
      reasons: ["finance_accounting_snapshot_exists"],
      excludeFromCertifiedTotals: false,
      excludeFromSettlementV2: false,
      presentationKey: "certifiedAccounting",
    };
  }

  const eligibility = evaluateCertifiedAccountingSnapshotEligibility({
    lifecycleStatus: calculated.lifecycleCompleted ? "completed" : "unmapped",
    lifecycleCompleted: calculated.lifecycleCompleted,
    paymentChannel: calculated.paymentMethod,
    paymentStatus: calculated.paymentStatus,
  });

  const missingMajors = calculated.reconciliationBlockers.some((b) =>
    /gross_fare|driver_net|platform_commission|vat_|currency_missing/.test(b),
  );

  if (missingMajors) {
    return {
      state: "historical_incomplete",
      reasons: calculated.reconciliationBlockers.filter((b) =>
        /gross_fare|driver_net|platform_commission|vat_|currency_missing|missing/.test(
          b,
        ),
      ),
      excludeFromCertifiedTotals: true,
      excludeFromSettlementV2: true,
      presentationKey: "historicalFinancialIncomplete",
    };
  }

  if (!eligibility.eligible) {
    return {
      state: "pending_uncollected",
      reasons: eligibility.blockers,
      excludeFromCertifiedTotals: true,
      excludeFromSettlementV2: true,
      presentationKey: "pendingUncollected",
    };
  }

  if (calculated.reconciliationStatus === "preconditions_ok") {
    return {
      state: "certified_ready",
      reasons: ["preconditions_ok", calculated.snapshotEligibilityTrigger],
      excludeFromCertifiedTotals: false,
      excludeFromSettlementV2: false,
      presentationKey: "certifiedAccounting",
    };
  }

  return {
    state: "not_applicable",
    reasons: calculated.reconciliationBlockers,
    excludeFromCertifiedTotals: true,
    excludeFromSettlementV2: true,
    presentationKey: null,
  };
}
