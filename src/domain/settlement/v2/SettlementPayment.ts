/**
 * Settlement payment domain — pending → confirmed | reversed.
 */

import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { SettlementDirection } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { SettlementV2PaymentStatus } from "@/domain/settlement/v2/SettlementV2";

export type SettlementPayment = {
  id: string;
  settlementId: string;
  direction: SettlementDirection;
  amountMinor: bigint;
  currency: string;
  status: SettlementV2PaymentStatus;
  createdByUserId: string;
  confirmedByUserId: string | null;
  reversedByUserId: string | null;
  idempotencyKey: string;
  createdAtUtc: string;
  confirmedAtUtc: string | null;
  reversedAtUtc: string | null;
  reason?: string;
};

export function buildPaymentIdempotencyKey(input: {
  actorUid: string;
  op: "payment.create" | "payment.confirm" | "payment.reverse";
  settlementId: string;
  clientKey: string;
}): string {
  return buildFinanceIdempotencyKey({
    actorUid: input.actorUid,
    op: input.op,
    resourceType: "settlement_payments",
    resourceId: input.settlementId,
    clientKey: input.clientKey,
  });
}

export function canConfirmPayment(status: SettlementV2PaymentStatus): boolean {
  return status === "pending";
}

export function canReversePayment(status: SettlementV2PaymentStatus): boolean {
  return status === "confirmed";
}
