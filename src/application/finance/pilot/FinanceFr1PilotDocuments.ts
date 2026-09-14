/**
 * FR1 pilot apply — snapshot + audit + idempotency document builders.
 * Create-only payloads. No Settlement V2 / order / domain writes.
 */

import {
  FINANCE_FR1_PILOT_CLIENT_KEY,
  FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import type { FinanceFr1CalculatedSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";

export type FinanceFr1PilotIdempotencyDoc = {
  readonly key: typeof FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID;
  readonly op: "snapshot.materialize";
  readonly clientKey: typeof FINANCE_FR1_PILOT_CLIENT_KEY;
  readonly schemaVersion: "finance_fr1_accounting_snapshot_pilot_v1";
  readonly source: "registry";
  readonly registryCollection: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION;
  readonly orderId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
  readonly snapshotId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
  readonly status: "APPLIED";
  readonly settlementV2: false;
  readonly orderMaterialization: "forbidden";
  readonly correlationId: string;
  readonly auditIntentId: string;
  readonly auditResultId: string;
  readonly actorUid: string;
  readonly fc01PolicyId: string;
  readonly fc01PolicyVersion: string;
  readonly createdAtUtc: string;
};

export function buildFinanceFr1PilotSnapshotDoc(input: {
  calculated: FinanceFr1CalculatedSnapshot;
  actorUid: string;
  correlationId: string;
  createdAtUtc: string;
}): Record<string, unknown> {
  const c = input.calculated;
  return {
    id: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    orderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    source: "registry",
    registryCollection: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
    schemaVersion: "finance_fr1_accounting_snapshot_pilot_v1",
    currency: c.currency,
    countryId: c.countryId,
    paymentMethod: c.paymentMethod,
    paymentStatus: c.paymentStatus,
    lifecycleCompleted: c.lifecycleCompleted,
    grossFareMinor: c.grossFareMinor,
    eligibleRevenueMinor: c.eligibleRevenueMinor,
    commissionRatePercent: c.commissionRatePercent,
    commissionPolicyId: c.commissionPolicyId,
    commissionPolicyVersion: c.commissionPolicyVersion,
    commissionAmountPersistedMinor: c.commissionAmountPersistedMinor,
    commissionAmountFromApprovedRateMinor:
      c.commissionAmountFromApprovedRateMinor,
    vatAmountMinor: c.vatAmountMinor,
    driverGrossMinor: c.driverGrossMinor,
    driverDeductionsMinor: c.driverDeductionsMinor,
    driverNetMinor: c.driverNetMinor,
    agentAttributionStatus: c.agentAttributionStatus,
    agentId: c.agentId,
    agentShareMinor: c.agentShareMinor,
    companyAllocationMinor: c.companyAllocationMinor,
    settlementDirection: c.settlementDirection,
    mutatesOrderMajors: false,
    historicalReRateForbidden: true,
    settlementV2: false,
    correlationId: input.correlationId,
    createdByUserId: input.actorUid,
    createdAtUtc: input.createdAtUtc,
    financePilot: true,
    synthetic: true,
  };
}

export function buildFinanceFr1PilotAuditIntentDoc(input: {
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
    action: "snapshot.materialize.intent",
    resourceType: "finance_accounting_snapshots",
    resourceId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    source: "registry",
    financePilot: true,
  };
}

export function buildFinanceFr1PilotAuditResultDoc(input: {
  id: string;
  actorUid: string;
  correlationId: string;
  idempotencyKey: string;
  snapshotId: string;
  atUtc: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    atUtc: input.atUtc,
    actorUserId: input.actorUid,
    action: "snapshot.materialize.result",
    resourceType: "finance_accounting_snapshots",
    resourceId: input.snapshotId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    outcome: "applied",
    source: "registry",
    financePilot: true,
  };
}

export function buildFinanceFr1PilotIdempotencyDoc(input: {
  actorUid: string;
  correlationId: string;
  auditIntentId: string;
  auditResultId: string;
  createdAtUtc: string;
}): FinanceFr1PilotIdempotencyDoc {
  return {
    key: FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID,
    op: "snapshot.materialize",
    clientKey: FINANCE_FR1_PILOT_CLIENT_KEY,
    schemaVersion: "finance_fr1_accounting_snapshot_pilot_v1",
    source: "registry",
    registryCollection: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
    orderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    snapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    status: "APPLIED",
    settlementV2: false,
    orderMaterialization: "forbidden",
    correlationId: input.correlationId,
    auditIntentId: input.auditIntentId,
    auditResultId: input.auditResultId,
    actorUid: input.actorUid,
    fc01PolicyId: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.policyId,
    fc01PolicyVersion: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version,
    createdAtUtc: input.createdAtUtc,
  };
}

export function isConsistentFinanceFr1PilotAppliedState(input: {
  snapshot: Record<string, unknown> | null;
  idempotency: Record<string, unknown> | null;
}): boolean {
  const snap = input.snapshot;
  const idem = input.idempotency;
  if (!snap || !idem) return false;
  return (
    snap.orderId === FINANCE_FR1_SYNTHETIC_ORDER_ID &&
    snap.currency === "SAR" &&
    snap.paymentMethod === "cash" &&
    String(snap.grossFareMinor) === "10000" &&
    String(snap.eligibleRevenueMinor) === "10000" &&
    Number(snap.commissionRatePercent) === 15 &&
    String(snap.commissionAmountPersistedMinor) === "1500" &&
    String(snap.driverDeductionsMinor) === "1500" &&
    String(snap.driverNetMinor) === "8500" &&
    snap.mutatesOrderMajors === false &&
    snap.historicalReRateForbidden === true &&
    idem.key === FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID &&
    idem.op === "snapshot.materialize" &&
    idem.status === "APPLIED" &&
    idem.snapshotId === FINANCE_FR1_SYNTHETIC_ORDER_ID &&
    idem.settlementV2 === false &&
    typeof idem.auditIntentId === "string" &&
    typeof idem.auditResultId === "string"
  );
}

/** Locked expected values for approved registry fixture. */
export const FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS = {
  currency: "SAR",
  paymentMethod: "cash",
  grossFareMinor: "10000",
  eligibleRevenueMinor: "10000",
  commissionRatePercent: 15,
  commissionAmountMinor: "1500",
  driverDeductionsMinor: "1500",
  driverNetMinor: "8500",
} as const;

export function assertCalculatedMatchesLockedFixture(
  calculated: FinanceFr1CalculatedSnapshot,
): string[] {
  const denials: string[] = [];
  if (calculated.currency !== "SAR") denials.push("currency!=SAR");
  if (calculated.paymentMethod !== "cash") denials.push("paymentMethod!=cash");
  if (calculated.grossFareMinor !== "10000") denials.push("gross!=10000");
  if (calculated.eligibleRevenueMinor !== "10000") {
    denials.push("eligible!=10000");
  }
  if (calculated.commissionRatePercent !== 15) denials.push("rate!=15");
  if (calculated.commissionAmountPersistedMinor !== "1500") {
    denials.push("commission!=1500");
  }
  if (calculated.commissionAmountFromApprovedRateMinor !== "1500") {
    denials.push("commission_from_rate!=1500");
  }
  if (calculated.driverDeductionsMinor !== "1500") {
    denials.push("deductions!=1500");
  }
  if (calculated.driverNetMinor !== "8500") denials.push("net!=8500");
  if (calculated.historicalReRateForbidden !== true) {
    denials.push("historical_re_rate_not_forbidden");
  }
  if (calculated.mutatesOrderMajors !== false) {
    denials.push("mutates_order_majors");
  }
  return denials;
}
