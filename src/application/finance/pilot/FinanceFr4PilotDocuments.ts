/**
 * FR4 Settlement Approval pilot — document builders + consistency checks.
 * UPDATE-only settlement approval fields. Never mutates FR1 snapshot / FR2 create
 * amounts / currency / direction / source. No settlement_payments.
 */

import {
  canTransitionSettlementV2,
  creatorCannotApprove,
  buildFinanceIdempotencyKey,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import { mapV2StatusToSyntheticDisplay } from "@/domain/settlement/v2/SettlementV2StateMachine";
import {
  FINANCE_FR4_PILOT_CLIENT_KEY,
  FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR4_POST_APPROVAL_STATUS,
  FINANCE_FR4_SETTLEMENT_DOC_ID,
  FINANCE_FR4_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";
import { isConsistentFinanceFr2PilotAppliedState } from "@/application/finance/pilot/FinanceFr2PilotDocuments";
import { FINANCE_FR2_SOURCE_SNAPSHOT_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";

export type FinanceFr4PilotIdempotencyDoc = {
  readonly key: typeof FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID;
  readonly op: "settlement.lock";
  readonly clientKey: typeof FINANCE_FR4_PILOT_CLIENT_KEY;
  readonly schemaVersion: "finance_fr4_settlement_approval_pilot_v1";
  readonly source: "fr2_settlement_draft";
  readonly settlementId: typeof FINANCE_FR4_SETTLEMENT_DOC_ID;
  readonly sourceAccountingSnapshotId: typeof FINANCE_FR4_SOURCE_SNAPSHOT_ID;
  readonly status: "APPLIED";
  readonly fromStatus: "draft";
  readonly toStatus: typeof FINANCE_FR4_POST_APPROVAL_STATUS;
  readonly opsApprovalLabel: "approved";
  readonly paymentExecution: false;
  readonly mutatesFinanceSnapshot: false;
  readonly mutatesSettlementAmounts: false;
  readonly correlationId: string;
  readonly auditIntentId: string;
  readonly auditResultId: string;
  readonly actorUid: string;
  readonly createdAtUtc: string;
};

/** Approval field patch only — never amount/currency/direction/source/claims. */
export function buildFinanceFr4SettlementApprovalPatch(input: {
  approverUid: string;
  correlationId: string;
  approvedAtUtc: string;
}): Record<string, unknown> {
  return {
    status: FINANCE_FR4_POST_APPROVAL_STATUS,
    lockedByUserId: input.approverUid,
    lockedAtUtc: input.approvedAtUtc,
    approvedBy: input.approverUid,
    approvedAt: input.approvedAtUtc,
    approvalCorrelationId: input.correlationId,
    updatedAtUtc: input.approvedAtUtc,
  };
}

export function buildFinanceFr4PilotAuditIntentDoc(input: {
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
    action: "settlement.lock.intent",
    resourceType: "financial_settlements",
    resourceId: FINANCE_FR4_SETTLEMENT_DOC_ID,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    source: "fr2_settlement_draft",
    fromStatus: "draft",
    toStatus: FINANCE_FR4_POST_APPROVAL_STATUS,
    opsApprovalLabel: "approved",
    financePilot: true,
  };
}

export function buildFinanceFr4PilotAuditResultDoc(input: {
  id: string;
  actorUid: string;
  correlationId: string;
  idempotencyKey: string;
  settlementId: string;
  atUtc: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    atUtc: input.atUtc,
    actorUserId: input.actorUid,
    action: "settlement.lock.result",
    resourceType: "financial_settlements",
    resourceId: input.settlementId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    outcome: "applied",
    source: "fr2_settlement_draft",
    fromStatus: "draft",
    toStatus: FINANCE_FR4_POST_APPROVAL_STATUS,
    opsApprovalLabel: "approved",
    financePilot: true,
  };
}

export function buildFinanceFr4PilotIdempotencyDoc(input: {
  actorUid: string;
  correlationId: string;
  auditIntentId: string;
  auditResultId: string;
  createdAtUtc: string;
}): FinanceFr4PilotIdempotencyDoc {
  return {
    key: FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID,
    op: "settlement.lock",
    clientKey: FINANCE_FR4_PILOT_CLIENT_KEY,
    schemaVersion: "finance_fr4_settlement_approval_pilot_v1",
    source: "fr2_settlement_draft",
    settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
    sourceAccountingSnapshotId: FINANCE_FR4_SOURCE_SNAPSHOT_ID,
    status: "APPLIED",
    fromStatus: "draft",
    toStatus: FINANCE_FR4_POST_APPROVAL_STATUS,
    opsApprovalLabel: "approved",
    paymentExecution: false,
    mutatesFinanceSnapshot: false,
    mutatesSettlementAmounts: false,
    correlationId: input.correlationId,
    auditIntentId: input.auditIntentId,
    auditResultId: input.auditResultId,
    actorUid: input.actorUid,
    createdAtUtc: input.createdAtUtc,
  };
}

export function financeFr4ApprovalIdempotencyKeyPattern(
  approverUid: string,
): string {
  return buildFinanceIdempotencyKey({
    actorUid: approverUid,
    op: "settlement.lock",
    resourceType: "financial_settlements",
    resourceId: FINANCE_FR4_SETTLEMENT_DOC_ID,
    clientKey: FINANCE_FR4_PILOT_CLIENT_KEY,
  });
}

/** FR2 draft settlement precondition (status still draft; amounts locked). */
export function isFinanceFr4Fr2DraftPrecondition(input: {
  settlement: Record<string, unknown> | null;
  fr2Idempotency: Record<string, unknown> | null;
}): boolean {
  if (
    !isConsistentFinanceFr2PilotAppliedState({
      settlement: input.settlement,
      idempotency: input.fr2Idempotency,
    })
  ) {
    return false;
  }
  const s = input.settlement!;
  return (
    s.status === "draft" &&
    s.lockedByUserId == null &&
    Number(s.amountMinor) === 1500 &&
    Number(s.paidConfirmedMinor) === 0 &&
    s.direction === "DRIVER_PAYS_COMPANY" &&
    s.currency === "SAR" &&
    s.sourceAccountingSnapshotId === FINANCE_FR2_SOURCE_SNAPSHOT_ID
  );
}

/** Post-approval consistent state (locked + FR4 idempotency). */
export function isConsistentFinanceFr4PilotAppliedState(input: {
  settlement: Record<string, unknown> | null;
  fr4Idempotency: Record<string, unknown> | null;
}): boolean {
  const s = input.settlement;
  const idem = input.fr4Idempotency;
  if (!s || !idem) return false;
  const opsLabel = mapV2StatusToSyntheticDisplay(
    s.status === "locked" ? "locked" : "draft",
  );
  return (
    s.id === FINANCE_FR4_SETTLEMENT_DOC_ID &&
    s.status === FINANCE_FR4_POST_APPROVAL_STATUS &&
    opsLabel === "approved" &&
    typeof s.lockedByUserId === "string" &&
    s.lockedByUserId.length > 0 &&
    typeof s.approvedBy === "string" &&
    s.approvedBy === s.lockedByUserId &&
    typeof s.approvedAt === "string" &&
    Number(s.amountMinor) === 1500 &&
    Number(s.paidConfirmedMinor) === 0 &&
    s.direction === "DRIVER_PAYS_COMPANY" &&
    s.currency === "SAR" &&
    s.sourceAccountingSnapshotId === FINANCE_FR4_SOURCE_SNAPSHOT_ID &&
    s.mutatesFinanceSnapshot === false &&
    s.paymentExecutionForbidden === true &&
    idem.key === FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID &&
    idem.op === "settlement.lock" &&
    idem.status === "APPLIED" &&
    idem.settlementId === FINANCE_FR4_SETTLEMENT_DOC_ID &&
    idem.paymentExecution === false &&
    idem.mutatesSettlementAmounts === false &&
    typeof idem.auditIntentId === "string" &&
    typeof idem.auditResultId === "string"
  );
}

export function assertFinanceFr4ApprovalTransitionAllowed(input: {
  settlement: Record<string, unknown>;
  approverUid: string;
}): string[] {
  const denials: string[] = [];
  const status = String(input.settlement.status ?? "");
  if (status !== "draft") {
    denials.push(`invalid_from_status:${status}`);
  }
  if (!canTransitionSettlementV2("draft", "locked")) {
    denials.push("invalid_transition:draft->locked");
  }
  const creator = String(input.settlement.createdByUserId ?? "");
  if (!creator) {
    denials.push("createdByUserId_missing");
  } else if (!creatorCannotApprove(creator, input.approverUid)) {
    denials.push("dual_control_violation");
  }
  if (Number(input.settlement.amountMinor) !== 1500) {
    denials.push("amountMinor_must_remain_1500");
  }
  if (Number(input.settlement.paidConfirmedMinor) !== 0) {
    denials.push("paidConfirmedMinor_must_remain_0");
  }
  if (input.settlement.currency !== "SAR") {
    denials.push("currency_must_remain_SAR");
  }
  if (input.settlement.direction !== "DRIVER_PAYS_COMPANY") {
    denials.push("direction_must_remain_DRIVER_PAYS_COMPANY");
  }
  if (
    input.settlement.sourceAccountingSnapshotId !== FINANCE_FR4_SOURCE_SNAPSHOT_ID
  ) {
    denials.push("source_must_remain_fr1_snapshot");
  }
  return denials;
}

/** Locked post-approval expectations for this pilot. */
export const FINANCE_FR4_LOCKED_APPROVAL_EXPECTATIONS = {
  settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
  fromStatus: "draft",
  toStatus: FINANCE_FR4_POST_APPROVAL_STATUS,
  opsApprovalLabel: "approved",
  exactTransition: "draft → locked (= approved)",
  currency: "SAR",
  direction: "DRIVER_PAYS_COMPANY",
  amountMinor: "1500",
  paidConfirmedMinor: "0",
  outstandingMinor: "1500",
  sourceAccountingSnapshotId: FINANCE_FR4_SOURCE_SNAPSHOT_ID,
  mutatesFinanceSnapshot: false,
  mutatesSettlementAmounts: false,
  paymentExecutionForbidden: true,
  settlementPaymentsWritten: false,
  allowedFieldMutations: [
    "status",
    "lockedByUserId",
    "lockedAtUtc",
    "approvedAt",
    "approvedBy",
    "approvalCorrelationId",
    "updatedAtUtc",
  ],
  requiredRbac: "settlements:approve",
} as const;
