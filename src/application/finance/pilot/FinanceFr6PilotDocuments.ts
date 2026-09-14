/**
 * FR6 adjustment pilot document builders / consistency checks.
 */

import {
  FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR,
  FINANCE_FR6_ADJUSTMENT_CURRENCY,
  FINANCE_FR6_ADJUSTMENT_DIRECTION,
  FINANCE_FR6_ADJUSTMENT_DOC_ID,
  FINANCE_FR6_ADJUSTMENT_REASON,
  FINANCE_FR6_ADJUSTMENT_RESPONSIBLE_PARTY,
  FINANCE_FR6_PAYMENT_DOC_ID,
  FINANCE_FR6_PILOT_CLIENT_KEY,
  FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR6_SETTLEMENT_DOC_ID,
  FINANCE_FR6_SOURCE_ORDER_ID,
  FINANCE_FR6_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";

export const FINANCE_FR6_LOCKED_ADJUSTMENT_EXPECTATIONS = {
  id: FINANCE_FR6_ADJUSTMENT_DOC_ID,
  status: "approved",
  currency: FINANCE_FR6_ADJUSTMENT_CURRENCY,
  amountMinor: Number(FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR),
  direction: FINANCE_FR6_ADJUSTMENT_DIRECTION,
  responsibleParty: FINANCE_FR6_ADJUSTMENT_RESPONSIBLE_PARTY,
  reason: FINANCE_FR6_ADJUSTMENT_REASON,
  relatedOrderId: FINANCE_FR6_SOURCE_ORDER_ID,
  relatedSettlementId: FINANCE_FR6_SETTLEMENT_DOC_ID,
  mutatesOrderMajors: false,
  mutatesFr1Principal: false,
  mutatesSettlementPaymentState: false,
} as const;

export function buildFinanceFr6AdjustmentDoc(input: {
  createdByUserId: string;
  approvedByUserId: string;
  correlationId: string;
  idempotencyKey: string;
  createdAtUtc: string;
  approvedAtUtc: string;
}): Record<string, unknown> {
  return {
    id: FINANCE_FR6_ADJUSTMENT_DOC_ID,
    status: "approved",
    countryId: "saudi_arabia",
    currency: FINANCE_FR6_ADJUSTMENT_CURRENCY,
    amountMinor: Number(FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR),
    direction: FINANCE_FR6_ADJUSTMENT_DIRECTION,
    responsibleParty: FINANCE_FR6_ADJUSTMENT_RESPONSIBLE_PARTY,
    reason: FINANCE_FR6_ADJUSTMENT_REASON,
    relatedOrderId: FINANCE_FR6_SOURCE_ORDER_ID,
    relatedSettlementId: FINANCE_FR6_SETTLEMENT_DOC_ID,
    relatedSnapshotId: FINANCE_FR6_SOURCE_SNAPSHOT_ID,
    relatedPaymentId: FINANCE_FR6_PAYMENT_DOC_ID,
    createdByUserId: input.createdByUserId,
    approvedByUserId: input.approvedByUserId,
    rejectedByUserId: null,
    idempotencyKey: input.idempotencyKey,
    createdAtUtc: input.createdAtUtc,
    approvedAtUtc: input.approvedAtUtc,
    rejectedAtUtc: null,
    mutatesOrderMajors: false,
    mutatesFr1Principal: false,
    mutatesSettlementPaymentState: false,
    correlationId: input.correlationId,
    clientKey: FINANCE_FR6_PILOT_CLIENT_KEY,
    pilotPhase: "FR6",
  };
}

export function buildFinanceFr6PilotAuditIntentDoc(input: {
  id: string;
  actorUserId: string;
  correlationId: string;
  idempotencyKey: string;
  atUtc: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    atUtc: input.atUtc,
    actorUserId: input.actorUserId,
    action: "adjustment.create_approve.intent",
    resourceType: "finance_adjustments",
    resourceId: FINANCE_FR6_ADJUSTMENT_DOC_ID,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    reason: FINANCE_FR6_ADJUSTMENT_REASON,
    sourceSettlementId: FINANCE_FR6_SETTLEMENT_DOC_ID,
    sourceSnapshotId: FINANCE_FR6_SOURCE_SNAPSHOT_ID,
  };
}

export function buildFinanceFr6PilotAuditResultDoc(input: {
  id: string;
  actorUserId: string;
  correlationId: string;
  idempotencyKey: string;
  atUtc: string;
  outcome: "applied" | "already_applied" | "conflict_no_go";
}): Record<string, unknown> {
  return {
    id: input.id,
    atUtc: input.atUtc,
    actorUserId: input.actorUserId,
    action: "adjustment.create_approve.result",
    resourceType: "finance_adjustments",
    resourceId: FINANCE_FR6_ADJUSTMENT_DOC_ID,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    reason: FINANCE_FR6_ADJUSTMENT_REASON,
    outcome: input.outcome,
    sourceSettlementId: FINANCE_FR6_SETTLEMENT_DOC_ID,
    sourceSnapshotId: FINANCE_FR6_SOURCE_SNAPSHOT_ID,
  };
}

export function buildFinanceFr6PilotIdempotencyDoc(input: {
  actorUserId: string;
  approverUserId: string;
  correlationId: string;
  auditIntentId: string;
  auditResultId: string;
  atUtc: string;
}): Record<string, unknown> {
  return {
    id: FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID,
    clientKey: FINANCE_FR6_PILOT_CLIENT_KEY,
    phase: "FR6",
    op: "adjustment.create_approve",
    resourceType: "finance_adjustments",
    resourceId: FINANCE_FR6_ADJUSTMENT_DOC_ID,
    actorUserId: input.actorUserId,
    approverUserId: input.approverUserId,
    correlationId: input.correlationId,
    auditIntentId: input.auditIntentId,
    auditResultId: input.auditResultId,
    appliedAtUtc: input.atUtc,
    status: "applied",
  };
}

export function isFinanceFr6Fr5SettledPrecondition(input: {
  settlement: Record<string, unknown> | null | undefined;
  payment: Record<string, unknown> | null | undefined;
}): boolean {
  const s = input.settlement;
  const p = input.payment;
  if (!s || !p) return false;
  return (
    s.id === FINANCE_FR6_SETTLEMENT_DOC_ID &&
    s.status === "settled" &&
    s.direction === "DRIVER_PAYS_COMPANY" &&
    Number(s.amountMinor) === 1500 &&
    Number(s.paidConfirmedMinor) === 1500 &&
    p.id === FINANCE_FR6_PAYMENT_DOC_ID &&
    p.status === "confirmed" &&
    Number(p.amountMinor) === 1500
  );
}

export function isConsistentFinanceFr6PilotAppliedState(input: {
  adjustment: Record<string, unknown> | null | undefined;
  settlement: Record<string, unknown> | null | undefined;
  snapshot: Record<string, unknown> | null | undefined;
}): boolean {
  const a = input.adjustment;
  const s = input.settlement;
  const snap = input.snapshot;
  if (!a || !s) return false;
  const settlementUntouched =
    s.status === "settled" &&
    Number(s.paidConfirmedMinor) === 1500 &&
    Number(s.amountMinor) === 1500;
  const snapGross = snap
    ? Number(
        snap.grossFareMinor ??
          (snap.majors as { grossFare?: { amountMinor?: number } } | undefined)
            ?.grossFare?.amountMinor,
      )
    : NaN;
  const snapUntouched =
    !snap ||
    snapGross === 10000 ||
    snap.id === FINANCE_FR6_SOURCE_SNAPSHOT_ID;
  return (
    a.id === FINANCE_FR6_ADJUSTMENT_DOC_ID &&
    a.status === "approved" &&
    Number(a.amountMinor) === Number(FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR) &&
    a.mutatesOrderMajors === false &&
    a.mutatesFr1Principal === false &&
    settlementUntouched &&
    snapUntouched
  );
}
