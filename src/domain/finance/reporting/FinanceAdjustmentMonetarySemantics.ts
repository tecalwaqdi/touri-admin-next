/**
 * FR7 — Adjustment monetary impact semantics for reporting.
 * Inspect FR6 directions; do not invent effects.
 *
 * `neutral_memo`: memo-only — amount may be persisted for audit visibility,
 * but does NOT alter monetary totals / reconciled position.
 * Monetary directions apply only via canonical signed claim/balance semantics.
 */

import type { AdjustmentDirection } from "@/domain/finance/v2/Fr6CorrectionIntegrity";

export function adjustmentHasMonetaryEffect(
  direction: AdjustmentDirection | string | null | undefined,
): boolean {
  if (!direction) return false;
  return direction !== "neutral_memo";
}

/**
 * Signed company-claim impact for approved adjustments.
 * Positive = increases company claim / receivables.
 * Negative = decreases company claim.
 * `neutral_memo` → 0 (memo-only; never fabricate monetary effect).
 * Unknown direction → null (fail closed; missing ≠ 0).
 */
export function signedCompanyClaimImpactMinor(input: {
  direction: AdjustmentDirection | string | null | undefined;
  amountMinor: bigint | null | undefined;
  status: string | null | undefined;
}): bigint | null {
  if (input.status !== "approved") return BigInt(0);
  if (input.amountMinor == null) return null;
  const d = input.direction;
  if (d === "neutral_memo") return BigInt(0);
  if (d === "increase_company_claim" || d === "decrease_party_balance") {
    return input.amountMinor;
  }
  if (d === "decrease_company_claim" || d === "increase_party_balance") {
    return -input.amountMinor;
  }
  return null;
}

export function signedPartyBalanceImpactMinor(input: {
  direction: AdjustmentDirection | string | null | undefined;
  amountMinor: bigint | null | undefined;
  status: string | null | undefined;
}): bigint | null {
  if (input.status !== "approved") return BigInt(0);
  if (input.amountMinor == null) return null;
  const d = input.direction;
  if (d === "neutral_memo") return BigInt(0);
  if (d === "increase_party_balance") return input.amountMinor;
  if (d === "decrease_party_balance") return -input.amountMinor;
  if (d === "increase_company_claim" || d === "decrease_company_claim") {
    return BigInt(0);
  }
  return null;
}
