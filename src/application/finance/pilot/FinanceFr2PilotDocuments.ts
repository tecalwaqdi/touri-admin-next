/**
 * FR2 Settlement V2 pilot — settlement + audit + idempotency document builders.
 * Create-only payloads. Never mutates FR1 finance_accounting_snapshots.
 * Payment / payout / lock / execute forbidden in FR2.
 */

import {
  FINANCE_FR2_CLAIM_LINE_ID,
  FINANCE_FR2_COUNTRY_ID,
  FINANCE_FR2_PARTY_ID,
  FINANCE_FR2_PARTY_TYPE,
  FINANCE_FR2_PERIOD_FROM_UTC,
  FINANCE_FR2_PERIOD_TO_UTC,
  FINANCE_FR2_PILOT_CLIENT_KEY,
  FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import type { FinanceFr2CalculatedSettlement } from "@/application/finance/pilot/FinanceFr2PilotCalculator";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { isConsistentFinanceFr1PilotAppliedState } from "@/application/finance/pilot/FinanceFr1PilotDocuments";

export type FinanceFr2PilotIdempotencyDoc = {
  readonly key: typeof FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID;
  readonly op: "settlement.create";
  readonly clientKey: typeof FINANCE_FR2_PILOT_CLIENT_KEY;
  readonly schemaVersion: "finance_fr2_settlement_v2_pilot_v1";
  readonly source: "fr1_snapshot";
  readonly sourceAccountingSnapshotId: typeof FINANCE_FR2_SOURCE_SNAPSHOT_ID;
  readonly settlementId: typeof FINANCE_FR2_SETTLEMENT_DOC_ID;
  readonly status: "APPLIED";
  readonly paymentExecution: false;
  readonly mutatesFinanceSnapshot: false;
  readonly agentSettlementCreated: false;
  readonly correlationId: string;
  readonly auditIntentId: string;
  readonly auditResultId: string;
  readonly actorUid: string;
  readonly createdAtUtc: string;
};

export function buildFinanceFr2SettlementDoc(input: {
  calculated: FinanceFr2CalculatedSettlement;
  actorUid: string;
  correlationId: string;
  createdAtUtc: string;
  idempotencyKey: string;
}): Record<string, unknown> {
  const c = input.calculated;
  return {
    id: FINANCE_FR2_SETTLEMENT_DOC_ID,
    partyType: FINANCE_FR2_PARTY_TYPE,
    partyId: FINANCE_FR2_PARTY_ID,
    countryId: FINANCE_FR2_COUNTRY_ID,
    currency: "SAR",
    status: "draft",
    direction: "DRIVER_PAYS_COMPANY",
    amountMinor: 1500,
    paidConfirmedMinor: 0,
    periodFromUtc: FINANCE_FR2_PERIOD_FROM_UTC,
    periodToUtc: FINANCE_FR2_PERIOD_TO_UTC,
    claims: [
      {
        lineId: FINANCE_FR2_CLAIM_LINE_ID,
        orderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
        amountMinor: 1500,
        currency: "SAR",
      },
    ],
    eligibleOrderIds: [FINANCE_FR1_SYNTHETIC_ORDER_ID],
    sourceAccountingSnapshotId: FINANCE_FR2_SOURCE_SNAPSHOT_ID,
    sourceOrderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    schemaVersion: "finance_fr2_settlement_v2_pilot_v1",
    financePilot: true,
    synthetic: true,
    productionApproved: false,
    mutatesFinanceSnapshot: false,
    paymentExecutionForbidden: true,
    agentSettlementCreated: false,
    agentAttributionStatus: c.agentAttributionStatus,
    agentShareMinor: null,
    fr1GrossFareMinor: "10000",
    fr1CommissionMinor: "1500",
    fr1DriverNetMinor: "8500",
    paymentMethod: "cash",
    createdByUserId: input.actorUid,
    lockedByUserId: null,
    voidedByUserId: null,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    createdAtUtc: input.createdAtUtc,
    updatedAtUtc: input.createdAtUtc,
    dueAtUtc: null,
    clientKey: FINANCE_FR2_PILOT_CLIENT_KEY,
  };
}

export function buildFinanceFr2PilotAuditIntentDoc(input: {
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
    action: "settlement.create.intent",
    resourceType: "financial_settlements",
    resourceId: FINANCE_FR2_SETTLEMENT_DOC_ID,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    source: "fr1_snapshot",
    sourceAccountingSnapshotId: FINANCE_FR2_SOURCE_SNAPSHOT_ID,
    financePilot: true,
  };
}

export function buildFinanceFr2PilotAuditResultDoc(input: {
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
    action: "settlement.create.result",
    resourceType: "financial_settlements",
    resourceId: input.settlementId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    outcome: "applied",
    source: "fr1_snapshot",
    sourceAccountingSnapshotId: FINANCE_FR2_SOURCE_SNAPSHOT_ID,
    financePilot: true,
  };
}

export function buildFinanceFr2PilotIdempotencyDoc(input: {
  actorUid: string;
  correlationId: string;
  auditIntentId: string;
  auditResultId: string;
  createdAtUtc: string;
}): FinanceFr2PilotIdempotencyDoc {
  return {
    key: FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID,
    op: "settlement.create",
    clientKey: FINANCE_FR2_PILOT_CLIENT_KEY,
    schemaVersion: "finance_fr2_settlement_v2_pilot_v1",
    source: "fr1_snapshot",
    sourceAccountingSnapshotId: FINANCE_FR2_SOURCE_SNAPSHOT_ID,
    settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
    status: "APPLIED",
    paymentExecution: false,
    mutatesFinanceSnapshot: false,
    agentSettlementCreated: false,
    correlationId: input.correlationId,
    auditIntentId: input.auditIntentId,
    auditResultId: input.auditResultId,
    actorUid: input.actorUid,
    createdAtUtc: input.createdAtUtc,
  };
}

export function isConsistentFinanceFr2PilotAppliedState(input: {
  settlement: Record<string, unknown> | null;
  idempotency: Record<string, unknown> | null;
}): boolean {
  const s = input.settlement;
  const idem = input.idempotency;
  if (!s || !idem) return false;
  return (
    s.id === FINANCE_FR2_SETTLEMENT_DOC_ID &&
    s.partyType === "driver" &&
    s.currency === "SAR" &&
    s.status === "draft" &&
    s.direction === "DRIVER_PAYS_COMPANY" &&
    Number(s.amountMinor) === 1500 &&
    Number(s.paidConfirmedMinor) === 0 &&
    s.sourceAccountingSnapshotId === FINANCE_FR2_SOURCE_SNAPSHOT_ID &&
    s.mutatesFinanceSnapshot === false &&
    s.paymentExecutionForbidden === true &&
    s.agentSettlementCreated === false &&
    idem.key === FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID &&
    idem.op === "settlement.create" &&
    idem.status === "APPLIED" &&
    idem.settlementId === FINANCE_FR2_SETTLEMENT_DOC_ID &&
    idem.paymentExecution === false &&
    idem.mutatesFinanceSnapshot === false &&
    typeof idem.auditIntentId === "string" &&
    typeof idem.auditResultId === "string"
  );
}

/** FR1 precondition: snapshot + FR1 idempotency must be consistently applied. */
export function isFr1PilotPreconditionComplete(input: {
  snapshot: Record<string, unknown> | null;
  fr1Idempotency: Record<string, unknown> | null;
}): boolean {
  return isConsistentFinanceFr1PilotAppliedState({
    snapshot: input.snapshot,
    idempotency: input.fr1Idempotency,
  });
}

/** Locked FR2 Settlement V2 state for this pilot. */
export const FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS = {
  settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
  partyType: "driver",
  partyId: FINANCE_FR2_PARTY_ID,
  countryId: FINANCE_FR2_COUNTRY_ID,
  currency: "SAR",
  status: "draft",
  direction: "DRIVER_PAYS_COMPANY",
  amountMinor: "1500",
  paidConfirmedMinor: "0",
  claimAmountMinor: "1500",
  claimLineId: FINANCE_FR2_CLAIM_LINE_ID,
  sourceAccountingSnapshotId: FINANCE_FR2_SOURCE_SNAPSHOT_ID,
  paymentMethod: "cash",
  fr1GrossFareMinor: "10000",
  fr1CommissionMinor: "1500",
  fr1DriverNetMinor: "8500",
  agentSettlementCreated: false,
  agentShareMinor: null,
  mutatesFinanceSnapshot: false,
  paymentExecutionForbidden: true,
} as const;
