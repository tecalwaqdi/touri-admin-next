/**
 * FC-02 DISCOUNT TREATMENT = APPROVED (F6).
 * - Preserve gross fare.
 * - Store discount separately.
 * - Derive eligible/net revenue only from authoritative policy inputs.
 * - Discount funding owner must be explicit: Company / Agent / Driver / Campaign.
 * - Unknown funding owner → POLICY_BLOCKED.
 * - Never default missing discount information to zero.
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import type { MoneyAvailability } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePolicyLockStatus } from "@/domain/finance/v2/policies/FinancePolicyCodes";

export type DiscountFundingOwner =
  | "company"
  | "agent"
  | "driver"
  | "campaign";

export const DISCOUNT_FUNDING_OWNERS: readonly DiscountFundingOwner[] = [
  "company",
  "agent",
  "driver",
  "campaign",
] as const;

export type DiscountTreatmentPolicyF6 = FinancialPolicy & {
  kind: "discount_treatment";
  treatmentStatus: "approved_f6";
  preserveGrossFare: true;
  storeDiscountSeparately: true;
  autoApplyToDriverNet: false;
  requireExplicitFundingOwner: true;
  neverDefaultMissingDiscountToZero: true;
};

export const FC02_LOCK_STATUS: FinancePolicyLockStatus = "APPROVED";

export const DISCOUNT_TREATMENT_POLICY_APPROVED_F6: DiscountTreatmentPolicyF6 = {
  policyId: "DISCOUNT_TREATMENT_POLICY_FC02",
  version: "1.0.0-f6-approved",
  status: "approved",
  effectiveFrom: "2026-09-13T00:00:00.000Z",
  effectiveTo: null,
  countryId: null,
  currencyCode: null,
  createdAtUtc: "2026-09-13T00:00:00.000Z",
  approvedAtUtc: "2026-09-13T00:00:00.000Z",
  approvedBy: "f6_human_policy_closure",
  /** Policy rules approved; Production write path still gated separately. */
  productionApproved: false,
  notes:
    "FC-02 APPROVED: preserve gross; discount separate; funding owner required; missing ≠ 0; settlement driver net = persisted total_mndob.",
  kind: "discount_treatment",
  treatmentStatus: "approved_f6",
  preserveGrossFare: true,
  storeDiscountSeparately: true,
  autoApplyToDriverNet: false,
  requireExplicitFundingOwner: true,
  neverDefaultMissingDiscountToZero: true,
};

export type DiscountAccountingComponent = {
  amountMinor: bigint | null;
  currency: string;
  fundingOwner: DiscountFundingOwner | null;
  availability: MoneyAvailability;
  grossFarePreserved: true;
  policyBlocked: boolean;
  blockerReason?: string;
};

/**
 * Resolve discount for accounting under FC-02 APPROVED rules.
 * Missing amount → incomplete/missing (never 0).
 * Unknown/missing funding owner when discount present → POLICY_BLOCKED.
 */
export function resolveDiscountAccounting(input: {
  currency: string;
  grossFareMinor: bigint | null | undefined;
  customerTotalMinor: bigint | null | undefined;
  explicitDiscountMinor?: bigint | null;
  fundingOwner?: DiscountFundingOwner | null;
}): DiscountAccountingComponent {
  const currency = input.currency.toUpperCase();
  const base: Omit<DiscountAccountingComponent, "amountMinor" | "fundingOwner" | "availability" | "policyBlocked" | "blockerReason"> =
    { currency, grossFarePreserved: true };

  let amountMinor: bigint | null = null;
  let availability: MoneyAvailability = "missing";

  if (
    input.explicitDiscountMinor !== null &&
    input.explicitDiscountMinor !== undefined
  ) {
    amountMinor =
      typeof input.explicitDiscountMinor === "bigint"
        ? input.explicitDiscountMinor
        : BigInt(input.explicitDiscountMinor);
    availability = "available";
  } else if (
    input.grossFareMinor != null &&
    input.customerTotalMinor != null
  ) {
    const gross =
      typeof input.grossFareMinor === "bigint"
        ? input.grossFareMinor
        : BigInt(input.grossFareMinor);
    const customer =
      typeof input.customerTotalMinor === "bigint"
        ? input.customerTotalMinor
        : BigInt(input.customerTotalMinor);
    const delta = gross - customer;
    if (delta > 0n) {
      amountMinor = delta;
      availability = "available";
    } else if (delta === 0n) {
      // No discount observed — still not inventing a zero discount line as authoritative money.
      amountMinor = null;
      availability = "not_represented";
    } else {
      amountMinor = null;
      availability = "unknown";
    }
  }

  const fundingOwner = input.fundingOwner ?? null;

  if (availability === "missing" || availability === "unknown") {
    return {
      ...base,
      amountMinor: null,
      fundingOwner,
      availability,
      policyBlocked: true,
      blockerReason: "discount_information_missing_never_default_zero",
    };
  }

  if (availability === "not_represented") {
    return {
      ...base,
      amountMinor: null,
      fundingOwner: null,
      availability: "not_represented",
      policyBlocked: false,
    };
  }

  if (!fundingOwner) {
    return {
      ...base,
      amountMinor,
      fundingOwner: null,
      availability,
      policyBlocked: true,
      blockerReason: "discount_funding_owner_unknown_policy_blocked",
    };
  }

  if (!DISCOUNT_FUNDING_OWNERS.includes(fundingOwner)) {
    return {
      ...base,
      amountMinor,
      fundingOwner: null,
      availability,
      policyBlocked: true,
      blockerReason: "discount_funding_owner_invalid_policy_blocked",
    };
  }

  return {
    ...base,
    amountMinor,
    fundingOwner,
    availability,
    policyBlocked: false,
  };
}

/** Settlement-eligible driver net remains persisted major (not discount-derived). */
export function mayAutoReduceDriverNetByDiscountUnderFc02(): false {
  return false;
}
