/**
 * Settlement V2 domain types — Production vocabulary (Legacy V2).
 * Synthetic SM remains lab-only elsewhere.
 */

import type {
  SettlementDirection,
  SettlementPartyType,
  SettlementV2Status,
} from "@/domain/finance/v2/FinanceImplementationContracts";

export type SettlementV2PaymentStatus = "pending" | "confirmed" | "reversed";

export type SettlementV2LineClaim = {
  lineId: string;
  orderId: string;
  amountMinor: bigint;
  currency: string;
};

export type SettlementV2 = {
  id: string;
  partyType: SettlementPartyType;
  partyId: string;
  countryId: string;
  currency: string;
  status: SettlementV2Status;
  direction: SettlementDirection;
  /** Due from eligible locked claims. */
  amountMinor: bigint;
  paidConfirmedMinor: bigint;
  periodFromUtc: string;
  periodToUtc: string;
  claims: SettlementV2LineClaim[];
  createdByUserId: string;
  lockedByUserId: string | null;
  voidedByUserId: string | null;
  idempotencyKey: string;
  correlationId: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  /** Ops UX optional. */
  dueAtUtc: string | null;
  productionApproved: false;
};

export type SettlementOpsLabel =
  | "open"
  | "paid"
  | "partial"
  | "overdue"
  | "reversed";

export function settlementOpsLabel(
  settlement: Pick<
    SettlementV2,
    "status" | "dueAtUtc" | "amountMinor" | "paidConfirmedMinor"
  >,
  nowUtc: string = new Date().toISOString(),
): SettlementOpsLabel {
  if (settlement.status === "voided") return "reversed";
  if (settlement.status === "settled") return "paid";
  if (settlement.status === "partially_paid") {
    if (
      settlement.dueAtUtc &&
      settlement.dueAtUtc < nowUtc &&
      settlement.paidConfirmedMinor < settlement.amountMinor
    ) {
      return "overdue";
    }
    return "partial";
  }
  if (
    (settlement.status === "locked" || settlement.status === "draft") &&
    settlement.dueAtUtc &&
    settlement.dueAtUtc < nowUtc
  ) {
    return "overdue";
  }
  return "open";
}

export function outstandingMinor(settlement: SettlementV2): bigint {
  return settlement.amountMinor - settlement.paidConfirmedMinor;
}
