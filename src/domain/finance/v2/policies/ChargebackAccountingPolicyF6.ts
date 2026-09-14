/**
 * FC-04 CHARGEBACK = APPROVED (F6).
 * - Never rewrite/delete historical trip.
 * - Chargeback = append-only financial adjustment.
 * - Liability only when authoritative evidence exists.
 * - Unknown/disputed → disputed/suspense.
 * - Chargeback fees = separate components.
 * - Reversal/settlement fully auditable.
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import type { FinancePolicyLockStatus } from "@/domain/finance/v2/policies/FinancePolicyCodes";

export type ChargebackLiabilityParty =
  | "company"
  | "driver"
  | "agent"
  | "customer"
  | "gateway"
  | "disputed_suspense";

export type ChargebackAccountingStatus =
  | "recorded"
  | "liability_attributed"
  | "disputed_suspense"
  | "reversed"
  | "settled";

export type ChargebackAccountingPolicyF6 = FinancialPolicy & {
  kind: "chargeback_accounting";
  appendOnly: true;
  neverRewriteHistoricalTrip: true;
  feesSeparate: true;
  disputedGoesToSuspense: true;
};

export const FC04_LOCK_STATUS: FinancePolicyLockStatus = "APPROVED";

export const CHARGEBACK_ACCOUNTING_POLICY_APPROVED_F6: ChargebackAccountingPolicyF6 =
  {
    policyId: "CHARGEBACK_ACCOUNTING_POLICY_FC04",
    version: "1.0.0-f6-approved",
    status: "approved",
    effectiveFrom: "2026-09-13T00:00:00.000Z",
    effectiveTo: null,
    countryId: null,
    currencyCode: null,
    createdAtUtc: "2026-09-13T00:00:00.000Z",
    approvedAtUtc: "2026-09-13T00:00:00.000Z",
    approvedBy: "f6_human_policy_closure",
    productionApproved: false,
    notes:
      "FC-04 APPROVED: append-only chargeback adjustment; no trip rewrite; disputed→suspense; fees separate; auditable.",
    kind: "chargeback_accounting",
    appendOnly: true,
    neverRewriteHistoricalTrip: true,
    feesSeparate: true,
    disputedGoesToSuspense: true,
  };

export type ChargebackAccountingRecord = {
  id: string;
  relatedOrderId: string;
  countryId: string;
  currency: string;
  /** Principal chargeback amount — null never 0 when unknown. */
  amountMinor: bigint | null;
  /** Separate fee component — never silently merged into principal. */
  feeAmountMinor: bigint | null;
  status: ChargebackAccountingStatus;
  liabilityParty: ChargebackLiabilityParty;
  evidencePresent: boolean;
  mutatesOrderMajors: false;
  idempotencyKey: string;
  createdByUserId: string;
  createdAtUtc: string;
};

export function resolveChargebackLiability(input: {
  evidencePresent: boolean;
  liabilityParty?: ChargebackLiabilityParty | null;
  disputed?: boolean;
}): ChargebackLiabilityParty {
  if (input.disputed === true || !input.evidencePresent) {
    return "disputed_suspense";
  }
  if (!input.liabilityParty || input.liabilityParty === "disputed_suspense") {
    return "disputed_suspense";
  }
  return input.liabilityParty;
}

export function assertChargebackDoesNotRewriteTrip(flags: {
  mutatesOrderMajors: boolean;
}): void {
  if (flags.mutatesOrderMajors) {
    throw new Error("fc04_historical_trip_rewrite_forbidden");
  }
}
