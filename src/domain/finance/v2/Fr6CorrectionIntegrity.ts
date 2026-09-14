/**
 * FR6 correction / recovery integrity — append-only layer rules.
 * Settled history is immutable; corrections do not rewrite FR1 majors or order.
 */

export type AdjustmentDirection =
  | "increase_company_claim"
  | "decrease_company_claim"
  | "increase_party_balance"
  | "decrease_party_balance"
  | "neutral_memo";

export type AdjustmentResponsibleParty =
  | "company"
  | "driver"
  | "agent"
  | "customer"
  | "gateway"
  | "unknown";

export type RefundKind = "customer_refund" | "internal_settlement_correction";

/** Absolute max single adjustment vs related settlement principal (pilot: claim amount). */
export function assertAdjustmentWithinLimit(input: {
  amountMinor: bigint;
  maxAmountMinor: bigint | null;
}): void {
  if (input.amountMinor === null || input.amountMinor === undefined) {
    throw new Error("missing_value_fail_closed:adjustment_amount");
  }
  if (input.amountMinor <= BigInt(0)) {
    throw new Error("adjustment_amount_must_be_positive");
  }
  if (input.maxAmountMinor !== null && input.amountMinor > input.maxAmountMinor) {
    throw new Error(
      `adjustment_over_limit:${input.amountMinor}>${input.maxAmountMinor}`,
    );
  }
}

export function assertCurrencyMatch(input: {
  currency: string;
  sourceCurrency: string | null | undefined;
}): void {
  const c = input.currency.trim().toUpperCase();
  if (!c) throw new Error("currency_required");
  if (
    input.sourceCurrency != null &&
    input.sourceCurrency.trim() !== "" &&
    c !== input.sourceCurrency.trim().toUpperCase()
  ) {
    throw new Error(
      `currency_mismatch:${c}!=${input.sourceCurrency.trim().toUpperCase()}`,
    );
  }
}

export function assertAdjustmentSourcePresent(input: {
  relatedOrderId?: string | null;
  relatedSettlementId?: string | null;
}): void {
  const order = (input.relatedOrderId ?? "").trim();
  const settlement = (input.relatedSettlementId ?? "").trim();
  if (!order && !settlement) {
    throw new Error("missing_source:relatedOrderId_or_relatedSettlementId");
  }
}

export function assertReasonPresent(reason: string | null | undefined): void {
  if (!reason || !String(reason).trim()) {
    throw new Error("missing_reason");
  }
}

/**
 * Settled settlement status is terminal for reopen via payment reverse.
 * Confirmed payment reverse is allowed only while locked | partially_paid.
 */
export function assertPaymentReverseAllowedOnSettlement(status: string): void {
  if (status === "settled") {
    throw new Error(
      "settled_history_immutable:use_append_only_adjustment_not_payment_reverse",
    );
  }
  if (status !== "locked" && status !== "partially_paid") {
    throw new Error(`payment_reverse_settlement_invalid:${status}`);
  }
}

export function assertReversalNotExceedOriginal(input: {
  reverseAmountMinor: bigint;
  originalConfirmedAmountMinor: bigint;
}): void {
  if (input.reverseAmountMinor > input.originalConfirmedAmountMinor) {
    throw new Error(
      `reversal_exceeds_original:${input.reverseAmountMinor}>${input.originalConfirmedAmountMinor}`,
    );
  }
}

export function assertRefundWithinRefundable(input: {
  amountMinor: bigint;
  refundableAmountMinor: bigint | null;
}): void {
  if (input.refundableAmountMinor === null) {
    throw new Error("missing_value_fail_closed:refundable_amount");
  }
  if (input.amountMinor > input.refundableAmountMinor) {
    throw new Error(
      `refund_exceeds_refundable:${input.amountMinor}>${input.refundableAmountMinor}`,
    );
  }
}

/**
 * Customer refund requires an authoritative external/gateway payment session.
 * Cash DRIVER_PAYS_COMPANY collection has no customer card session → deny inventing.
 */
export function assertCustomerRefundCapability(input: {
  kind: RefundKind;
  paymentChannel: "cash" | "card" | "unknown";
  gatewaySessionId?: string | null;
}): void {
  if (input.kind !== "customer_refund") return;
  if (input.paymentChannel === "cash") {
    throw new Error(
      "refund_capability_absent:cash_channel_no_customer_gateway_payment",
    );
  }
  if (!input.gatewaySessionId?.trim()) {
    throw new Error("refund_capability_absent:missing_gateway_session");
  }
}

export function assertChargebackFeeSeparate(input: {
  amountMinor: bigint | null;
  feeAmountMinor: bigint | null;
  mergedFeeIntoPrincipal?: boolean;
}): void {
  if (input.mergedFeeIntoPrincipal === true) {
    throw new Error("fc04_fee_merged_into_principal_forbidden");
  }
  // fee may be null (unknown) — never coerce to 0 silently at call site
  void input.amountMinor;
  void input.feeAmountMinor;
}

/** Cumulative adjustments must not invent impossible negative outstanding. */
export function assertCumulativeAdjustmentFeasible(input: {
  settlementAmountMinor: bigint;
  paidConfirmedMinor: bigint;
  approvedAdjustmentSumMinor: bigint;
  nextAdjustmentMinor: bigint;
  direction: AdjustmentDirection;
}): void {
  if (
    input.direction === "decrease_company_claim" ||
    input.direction === "decrease_party_balance"
  ) {
    const netClaim =
      input.settlementAmountMinor - input.approvedAdjustmentSumMinor;
    if (input.nextAdjustmentMinor > netClaim) {
      throw new Error(
        `impossible_balance:adjustment_would_exceed_remaining_claim`,
      );
    }
  }
  void input.paidConfirmedMinor;
}
