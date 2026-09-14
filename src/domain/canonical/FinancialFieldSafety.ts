/**
 * Phase 3.6 — Display / Settlement / Accounting safety for canonical financial trips.
 * Display may be true while settlement/accounting false.
 */

import type { FinancialAvailabilityStatus } from "@/domain/canonical/FieldProvenance";

export type SettlementBlockReasonCode =
  | "AGENT_ATTRIBUTION_UNKNOWN"
  | "DRIVER_NET_UNRESOLVED"
  | "COMMISSION_CONFLICT"
  | "VAT_POLICY_UNRESOLVED"
  | "CHARGEBACK_NOT_REPRESENTED"
  | "GATEWAY_FEE_MISSING"
  | "INCOMPLETE_MAJORS"
  | "DISCOUNT_TREATMENT_UNRESOLVED"
  | "CURRENCY_MISSING"
  | "CONFLICTING_FIELD";

export type TripFinancialSafety = {
  isSafeForDisplay: boolean;
  isSafeForSettlement: boolean;
  isSafeForAccounting: boolean;
  displayWarnings: string[];
  settlementBlockReasons: SettlementBlockReasonCode[];
  accountingBlockReasons: SettlementBlockReasonCode[];
};

export type SafetyInputField = {
  name: string;
  availability: FinancialAvailabilityStatus;
  value: number | null;
  /** Critical for settlement when missing/unknown/conflicting */
  criticalForSettlement?: boolean;
};

const CRITICAL_SETTLEMENT_CODES: Record<string, SettlementBlockReasonCode> = {
  agentAttribution: "AGENT_ATTRIBUTION_UNKNOWN",
  driverNet: "DRIVER_NET_UNRESOLVED",
  platformCommissionRate: "COMMISSION_CONFLICT",
  platformCommissionAmount: "COMMISSION_CONFLICT",
  vatRate: "VAT_POLICY_UNRESOLVED",
  vatAmount: "VAT_POLICY_UNRESOLVED",
  chargebackAmount: "CHARGEBACK_NOT_REPRESENTED",
  discountTreatment: "DISCOUNT_TREATMENT_UNRESOLVED",
  currency: "CURRENCY_MISSING",
};

function blocksSettlement(availability: FinancialAvailabilityStatus): boolean {
  return (
    availability === "missing" ||
    availability === "unknown" ||
    availability === "conflicting" ||
    availability === "not_represented"
  );
}

/**
 * Display-safe: enough majors to show a trip financially without inventing zeros.
 * Settlement/accounting require all critical fields available (or explicitly approved derived).
 */
export function evaluateTripFinancialSafety(input: {
  fields: SafetyInputField[];
  agentAttributionStatus: "snapshot" | "unknown_historical" | "present";
  discountTreatmentUnresolved: boolean;
  currencyPresent: boolean;
  hasConflictingCommissionRate: boolean;
  /** Derived driver net is displayable but not settlement-eligible by default. */
  driverNetDerivedOnly?: boolean;
}): TripFinancialSafety {
  const displayWarnings: string[] = [];
  const settlementBlockReasons: SettlementBlockReasonCode[] = [];
  const accountingBlockReasons: SettlementBlockReasonCode[] = [];

  const majors = ["grossFare", "finalCustomerAmount", "platformCommissionAmount"];
  const majorsOk = majors.every((name) => {
    const f = input.fields.find((x) => x.name === name);
    return f && f.availability === "available" && f.value != null;
  });

  if (!majorsOk) {
    displayWarnings.push("Incomplete major financial fields for full display");
    settlementBlockReasons.push("INCOMPLETE_MAJORS");
    accountingBlockReasons.push("INCOMPLETE_MAJORS");
  }

  if (!input.currencyPresent) {
    settlementBlockReasons.push("CURRENCY_MISSING");
    accountingBlockReasons.push("CURRENCY_MISSING");
    displayWarnings.push("currency_missing");
  }

  if (
    input.agentAttributionStatus === "unknown_historical"
  ) {
    settlementBlockReasons.push("AGENT_ATTRIBUTION_UNKNOWN");
    accountingBlockReasons.push("AGENT_ATTRIBUTION_UNKNOWN");
    displayWarnings.push(
      "Historical agent attribution unknown — trip displayable; agent settlement blocked",
    );
  }

  if (input.discountTreatmentUnresolved) {
    // Does not block READ display of persisted driver net; blocks claiming unified settlement formula.
    accountingBlockReasons.push("DISCOUNT_TREATMENT_UNRESOLVED");
    displayWarnings.push(
      "DiscountTreatmentPolicy unresolved (FC-02) — do not auto-reduce driver net by discount",
    );
  }

  if (input.hasConflictingCommissionRate) {
    // Rate conflict does not block reading persisted amount for display.
    accountingBlockReasons.push("COMMISSION_CONFLICT");
    displayWarnings.push(
      "Platform commission RATE unresolved (FC-01) — amount may still display from total_app",
    );
  }

  if (input.driverNetDerivedOnly) {
    settlementBlockReasons.push("DRIVER_NET_UNRESOLVED");
    accountingBlockReasons.push("DRIVER_NET_UNRESOLVED");
    displayWarnings.push(
      "Driver net derived — not settlement-eligible without explicit policy",
    );
  }

  for (const f of input.fields) {
    if (!f.criticalForSettlement) continue;
    if (blocksSettlement(f.availability)) {
      const code =
        CRITICAL_SETTLEMENT_CODES[f.name] ??
        (f.availability === "conflicting"
          ? "CONFLICTING_FIELD"
          : "INCOMPLETE_MAJORS");
      if (!settlementBlockReasons.includes(code)) {
        settlementBlockReasons.push(code);
      }
      if (!accountingBlockReasons.includes(code)) {
        accountingBlockReasons.push(code);
      }
    }
  }

  // Chargeback not_represented blocks claiming accounting completeness for chargebacks,
  // but does not by itself make the whole trip unsafe to display.
  const chargeback = input.fields.find((x) => x.name === "chargebackAmount");
  if (chargeback?.availability === "not_represented") {
    if (!accountingBlockReasons.includes("CHARGEBACK_NOT_REPRESENTED")) {
      accountingBlockReasons.push("CHARGEBACK_NOT_REPRESENTED");
    }
    displayWarnings.push(
      "Chargeback not_represented — do not report chargebacks=0",
    );
  }

  const isSafeForDisplay =
    majorsOk ||
    input.fields.some(
      (f) =>
        (f.name === "grossFare" || f.name === "finalCustomerAmount") &&
        f.availability === "available" &&
        f.value != null,
    );

  const isSafeForSettlement = settlementBlockReasons.length === 0;
  // Accounting requires settlement-safe PLUS no unresolved future-policy blockers in accounting list
  // that are stricter (discount + rate + chargeback).
  const isSafeForAccounting =
    isSafeForSettlement &&
    !accountingBlockReasons.includes("DISCOUNT_TREATMENT_UNRESOLVED") &&
    !accountingBlockReasons.includes("COMMISSION_CONFLICT") &&
    !accountingBlockReasons.includes("CHARGEBACK_NOT_REPRESENTED") &&
    !accountingBlockReasons.includes("VAT_POLICY_UNRESOLVED");

  return {
    isSafeForDisplay,
    isSafeForSettlement,
    isSafeForAccounting,
    displayWarnings,
    settlementBlockReasons: [...new Set(settlementBlockReasons)],
    accountingBlockReasons: [...new Set(accountingBlockReasons)],
  };
}
