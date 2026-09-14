/**
 * FR5 Settlement Execution pilot — document builders + consistency checks.
 * Atomic createPayment→confirmPayment full collection. No FR1 snapshot / order mutation.
 * No second settlement. No wallet / payout / bank-gateway success invention.
 */

import {
  canTransitionSettlementV2,
  buildFinanceIdempotencyKey,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import { buildPaymentIdempotencyKey } from "@/domain/settlement/v2/SettlementPayment";
import {
  FINANCE_FR5_EXACT_EXECUTION_DIRECTION,
  FINANCE_FR5_EXACT_TRANSITION,
  FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
  FINANCE_FR5_PAYMENT_COLLECTION,
  FINANCE_FR5_PAYMENT_CURRENCY,
  FINANCE_FR5_PAYMENT_DOC_ID,
  FINANCE_FR5_PAYMENT_METHOD,
  FINANCE_FR5_PAYMENT_RESOURCE_TYPE,
  FINANCE_FR5_PILOT_CLIENT_KEY,
  FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR5_POST_EXECUTION_STATUS,
  FINANCE_FR5_POST_PAYMENT_STATUS,
  FINANCE_FR5_SETTLEMENT_DOC_ID,
  FINANCE_FR5_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import { isConsistentFinanceFr4PilotAppliedState } from "@/application/finance/pilot/FinanceFr4PilotDocuments";
import { FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID } from "@/application/finance/pilot/FinanceFr4PilotConstants";

export type FinanceFr5PilotIdempotencyDoc = {
  readonly key: typeof FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID;
  readonly op: "payment.confirm";
  readonly clientKey: typeof FINANCE_FR5_PILOT_CLIENT_KEY;
  readonly schemaVersion: "finance_fr5_settlement_execution_pilot_v1";
  readonly source: "fr4_settlement_locked";
  readonly settlementId: typeof FINANCE_FR5_SETTLEMENT_DOC_ID;
  readonly paymentId: typeof FINANCE_FR5_PAYMENT_DOC_ID;
  readonly sourceAccountingSnapshotId: typeof FINANCE_FR5_SOURCE_SNAPSHOT_ID;
  readonly status: "APPLIED";
  readonly fromStatus: "locked";
  readonly toStatus: typeof FINANCE_FR5_POST_EXECUTION_STATUS;
  readonly paymentStatus: typeof FINANCE_FR5_POST_PAYMENT_STATUS;
  readonly direction: "DRIVER_PAYS_COMPANY";
  readonly amountMinor: typeof FINANCE_FR5_PAYMENT_AMOUNT_MINOR;
  readonly currency: typeof FINANCE_FR5_PAYMENT_CURRENCY;
  readonly paidConfirmedMinor: "1500";
  readonly outstandingMinor: "0";
  readonly mutatesFinanceSnapshot: false;
  readonly walletTouched: false;
  readonly payoutExecuted: false;
  readonly correlationId: string;
  readonly auditIntentId: string;
  readonly auditResultId: string;
  readonly actorUid: string;
  readonly createdAtUtc: string;
};

/** Settlement payment-state patch after full confirm (amountMinor immutable). */
export function buildFinanceFr5SettlementExecutionPatch(input: {
  executorUid: string;
  paymentId: string;
  confirmedAtUtc: string;
}): Record<string, unknown> {
  return {
    status: FINANCE_FR5_POST_EXECUTION_STATUS,
    paidConfirmedMinor: 1500,
    outstandingMinor: 0,
    paymentIds: [input.paymentId],
    paymentCount: 1,
    lastPaymentAt: input.confirmedAtUtc,
    settledAt: input.confirmedAtUtc,
    settledBy: input.executorUid,
    paymentExecutionForbidden: false,
    updatedAtUtc: input.confirmedAtUtc,
  };
}

/**
 * Final confirmed payment record (atomic create+confirm outcome).
 * Lifecycle: pending → confirmed; persisted once as confirmed for simplest full path.
 */
export function buildFinanceFr5ConfirmedPaymentDoc(input: {
  executorUid: string;
  correlationId: string;
  createdAtUtc: string;
  confirmedAtUtc: string;
  idempotencyKey: string;
}): Record<string, unknown> {
  return {
    id: FINANCE_FR5_PAYMENT_DOC_ID,
    paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
    settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
    direction: "DRIVER_PAYS_COMPANY",
    amountMinor: 1500,
    currency: FINANCE_FR5_PAYMENT_CURRENCY,
    status: FINANCE_FR5_POST_PAYMENT_STATUS,
    method: FINANCE_FR5_PAYMENT_METHOD,
    createdByUserId: input.executorUid,
    confirmedByUserId: input.executorUid,
    reversedByUserId: null,
    idempotencyKey: input.idempotencyKey,
    createdAtUtc: input.createdAtUtc,
    confirmedAtUtc: input.confirmedAtUtc,
    reversedAtUtc: null,
    correlationId: input.correlationId,
    schemaVersion: "finance_fr5_settlement_execution_pilot_v1",
    financePilot: true,
    synthetic: true,
    productionApproved: false,
    walletTouched: false,
    payoutExecuted: false,
    bankGatewaySuccessInvented: false,
    collection: FINANCE_FR5_PAYMENT_COLLECTION,
    resourceType: FINANCE_FR5_PAYMENT_RESOURCE_TYPE,
    lifecycle: "createPayment(pending)→confirmPayment(confirmed)",
  };
}

export function buildFinanceFr5PilotAuditIntentDoc(input: {
  id: string;
  actorUid: string;
  correlationId: string;
  idempotencyKey: string;
  atUtc: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    atUtc: input.atUtc,
    actorUserId: input.actorUid,
    action: "payment.confirm.intent",
    resourceType: FINANCE_FR5_PAYMENT_RESOURCE_TYPE,
    resourceId: FINANCE_FR5_PAYMENT_DOC_ID,
    settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    source: "fr4_settlement_locked",
    fromStatus: "locked",
    toStatus: FINANCE_FR5_POST_EXECUTION_STATUS,
    paymentStatus: FINANCE_FR5_POST_PAYMENT_STATUS,
    direction: "DRIVER_PAYS_COMPANY",
    amountMinor: FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
    currency: FINANCE_FR5_PAYMENT_CURRENCY,
    financePilot: true,
  };
}

export function buildFinanceFr5PilotAuditResultDoc(input: {
  id: string;
  actorUid: string;
  correlationId: string;
  idempotencyKey: string;
  paymentId: string;
  settlementId: string;
  atUtc: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    atUtc: input.atUtc,
    actorUserId: input.actorUid,
    action: "payment.confirm.result",
    resourceType: FINANCE_FR5_PAYMENT_RESOURCE_TYPE,
    resourceId: input.paymentId,
    settlementId: input.settlementId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    outcome: "applied",
    source: "fr4_settlement_locked",
    fromStatus: "locked",
    toStatus: FINANCE_FR5_POST_EXECUTION_STATUS,
    paymentStatus: FINANCE_FR5_POST_PAYMENT_STATUS,
    paidConfirmedMinor: "1500",
    outstandingMinor: "0",
    direction: "DRIVER_PAYS_COMPANY",
    amountMinor: FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
    currency: FINANCE_FR5_PAYMENT_CURRENCY,
    financePilot: true,
  };
}

export function buildFinanceFr5PilotIdempotencyDoc(input: {
  actorUid: string;
  correlationId: string;
  auditIntentId: string;
  auditResultId: string;
  createdAtUtc: string;
}): FinanceFr5PilotIdempotencyDoc {
  return {
    key: FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID,
    op: "payment.confirm",
    clientKey: FINANCE_FR5_PILOT_CLIENT_KEY,
    schemaVersion: "finance_fr5_settlement_execution_pilot_v1",
    source: "fr4_settlement_locked",
    settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
    paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
    sourceAccountingSnapshotId: FINANCE_FR5_SOURCE_SNAPSHOT_ID,
    status: "APPLIED",
    fromStatus: "locked",
    toStatus: FINANCE_FR5_POST_EXECUTION_STATUS,
    paymentStatus: FINANCE_FR5_POST_PAYMENT_STATUS,
    direction: "DRIVER_PAYS_COMPANY",
    amountMinor: FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
    currency: FINANCE_FR5_PAYMENT_CURRENCY,
    paidConfirmedMinor: "1500",
    outstandingMinor: "0",
    mutatesFinanceSnapshot: false,
    walletTouched: false,
    payoutExecuted: false,
    correlationId: input.correlationId,
    auditIntentId: input.auditIntentId,
    auditResultId: input.auditResultId,
    actorUid: input.actorUid,
    createdAtUtc: input.createdAtUtc,
  };
}

export function financeFr5ExecutionIdempotencyKeyPattern(
  executorUid: string,
): string {
  return buildPaymentIdempotencyKey({
    actorUid: executorUid,
    op: "payment.confirm",
    settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
    clientKey: FINANCE_FR5_PILOT_CLIENT_KEY,
  });
}

export function financeFr5PaymentCreateIdempotencyKeyPattern(
  executorUid: string,
): string {
  return buildPaymentIdempotencyKey({
    actorUid: executorUid,
    op: "payment.create",
    settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
    clientKey: FINANCE_FR5_PILOT_CLIENT_KEY,
  });
}

/** FR4 locked settlement precondition (ready for execution/collection). */
export function isFinanceFr5Fr4LockedPrecondition(input: {
  settlement: Record<string, unknown> | null;
  fr4Idempotency: Record<string, unknown> | null;
}): boolean {
  if (
    !isConsistentFinanceFr4PilotAppliedState({
      settlement: input.settlement,
      fr4Idempotency: input.fr4Idempotency,
    })
  ) {
    return false;
  }
  const s = input.settlement!;
  return (
    s.status === "locked" &&
    Number(s.amountMinor) === 1500 &&
    Number(s.paidConfirmedMinor) === 0 &&
    s.direction === "DRIVER_PAYS_COMPANY" &&
    s.currency === "SAR" &&
    s.sourceAccountingSnapshotId === FINANCE_FR5_SOURCE_SNAPSHOT_ID &&
    input.fr4Idempotency?.key === FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID
  );
}

/** Post-execution consistent state (settled + confirmed payment + FR5 idempotency). */
export function isConsistentFinanceFr5PilotAppliedState(input: {
  settlement: Record<string, unknown> | null;
  payment: Record<string, unknown> | null;
  fr5Idempotency: Record<string, unknown> | null;
}): boolean {
  const s = input.settlement;
  const p = input.payment;
  const idem = input.fr5Idempotency;
  if (!s || !p || !idem) return false;
  return (
    s.id === FINANCE_FR5_SETTLEMENT_DOC_ID &&
    s.status === FINANCE_FR5_POST_EXECUTION_STATUS &&
    Number(s.amountMinor) === 1500 &&
    Number(s.paidConfirmedMinor) === 1500 &&
    Number(s.outstandingMinor ?? 0) === 0 &&
    s.direction === "DRIVER_PAYS_COMPANY" &&
    s.currency === "SAR" &&
    s.sourceAccountingSnapshotId === FINANCE_FR5_SOURCE_SNAPSHOT_ID &&
    s.paymentExecutionForbidden === false &&
    p.id === FINANCE_FR5_PAYMENT_DOC_ID &&
    p.settlementId === FINANCE_FR5_SETTLEMENT_DOC_ID &&
    p.status === FINANCE_FR5_POST_PAYMENT_STATUS &&
    Number(p.amountMinor) === 1500 &&
    p.currency === "SAR" &&
    p.direction === "DRIVER_PAYS_COMPANY" &&
    p.walletTouched === false &&
    idem.key === FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID &&
    idem.op === "payment.confirm" &&
    idem.status === "APPLIED" &&
    idem.settlementId === FINANCE_FR5_SETTLEMENT_DOC_ID &&
    idem.paymentId === FINANCE_FR5_PAYMENT_DOC_ID &&
    idem.walletTouched === false &&
    idem.payoutExecuted === false &&
    typeof idem.auditIntentId === "string" &&
    typeof idem.auditResultId === "string"
  );
}

export function assertFinanceFr5ExecutionTransitionAllowed(input: {
  settlement: Record<string, unknown>;
  executorUid: string;
}): string[] {
  const denials: string[] = [];
  const status = String(input.settlement.status ?? "");
  if (status !== "locked") {
    denials.push(`invalid_from_status:${status}`);
  }
  if (!canTransitionSettlementV2("locked", "settled")) {
    denials.push("invalid_transition:locked->settled");
  }
  const creator = String(input.settlement.createdByUserId ?? "");
  const locker = String(
    input.settlement.lockedByUserId ?? input.settlement.approvedBy ?? "",
  );
  if (!creator) denials.push("createdByUserId_missing");
  if (!locker) denials.push("lockedByUserId_missing");
  if (creator && creator === input.executorUid) {
    denials.push("sod_violation_executor_eq_preparer");
  }
  if (locker && locker === input.executorUid) {
    denials.push("sod_violation_executor_eq_approver");
  }
  if (Number(input.settlement.amountMinor) !== 1500) {
    denials.push("amountMinor_must_remain_1500");
  }
  if (Number(input.settlement.paidConfirmedMinor) !== 0) {
    denials.push("paidConfirmedMinor_must_start_0");
  }
  if (input.settlement.currency !== "SAR") {
    denials.push("currency_must_remain_SAR");
  }
  if (input.settlement.direction !== "DRIVER_PAYS_COMPANY") {
    denials.push("direction_must_remain_DRIVER_PAYS_COMPANY");
  }
  if (
    input.settlement.sourceAccountingSnapshotId !== FINANCE_FR5_SOURCE_SNAPSHOT_ID
  ) {
    denials.push("source_must_remain_fr1_snapshot");
  }
  return denials;
}

export const FINANCE_FR5_LOCKED_EXECUTION_EXPECTATIONS = {
  settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
  paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
  paymentCollection: FINANCE_FR5_PAYMENT_COLLECTION,
  paymentResourceType: FINANCE_FR5_PAYMENT_RESOURCE_TYPE,
  fromStatus: "locked",
  toStatus: FINANCE_FR5_POST_EXECUTION_STATUS,
  paymentStatus: FINANCE_FR5_POST_PAYMENT_STATUS,
  exactTransition: FINANCE_FR5_EXACT_TRANSITION,
  exactExecutionDirection: FINANCE_FR5_EXACT_EXECUTION_DIRECTION,
  currency: FINANCE_FR5_PAYMENT_CURRENCY,
  direction: "DRIVER_PAYS_COMPANY",
  amountMinor: FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
  paidConfirmedMinor: "1500",
  outstandingMinor: "0",
  paymentMethod: FINANCE_FR5_PAYMENT_METHOD,
  sourceAccountingSnapshotId: FINANCE_FR5_SOURCE_SNAPSHOT_ID,
  mutatesFinanceSnapshot: false,
  walletTouched: false,
  payoutExecuted: false,
  bankGatewaySuccessInvented: false,
  requiredRbac: "settlements:execute",
  separationOfDuties: "prepare≠approve≠execute",
  approveDoesNotImplyExecute: true,
} as const;

void buildFinanceIdempotencyKey;
