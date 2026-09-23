/**
 * Production FR1 accounting snapshot document builders.
 * Reuses FinanceFr1CalculatedSnapshot (canonical calculator) — create-only payloads.
 * Never mutates order/ or Settlement V2.
 */

import type { FinanceFr1CalculatedSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import {
  FINANCE_FR1_AUDIT_COLLECTION,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";

export const ACCOUNTING_SNAPSHOT_SCHEMA_VERSION =
  "finance_fr1_accounting_snapshot_v1" as const;

export const ACCOUNTING_SNAPSHOT_CLIENT_KEY_PREFIX =
  "admin_fr1_materialize_v1" as const;

export {
  FINANCE_FR1_AUDIT_COLLECTION as ACCOUNTING_SNAPSHOT_AUDIT_COLLECTION,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION as ACCOUNTING_SNAPSHOT_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_SNAPSHOT_COLLECTION as ACCOUNTING_SNAPSHOT_COLLECTION,
};

export function buildProductionAccountingSnapshotDoc(input: {
  calculated: FinanceFr1CalculatedSnapshot;
  canonicalCountryId: string;
  actorUid: string;
  correlationId: string;
  idempotencyKey: string;
  createdAtUtc: string;
}): Record<string, unknown> {
  const c = input.calculated;
  return {
    id: c.orderId,
    orderId: c.orderId,
    source: "order",
    sourceCollection: "order",
    schemaVersion: ACCOUNTING_SNAPSHOT_SCHEMA_VERSION,
    currency: c.currency,
    countryId: input.canonicalCountryId,
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
    gatewayFeeMinor: c.gatewayFeeMinor,
    gatewayFeeCurrency: c.gatewayFeeCurrency,
    gatewayFeePolicyId: c.gatewayFeePolicyId,
    gatewayFeePolicyVersion: c.gatewayFeePolicyVersion,
    gatewayFeeAmountSource: c.gatewayFeeAmountSource,
    gatewayFeeOwner: c.gatewayFeeOwner,
    snapshotEligibilityTrigger: c.snapshotEligibilityTrigger,
    agentAttributionStatus: c.agentAttributionStatus,
    agentId: c.agentId,
    agentShareMinor: c.agentShareMinor,
    companyAllocationMinor: c.companyAllocationMinor,
    settlementDirection: c.settlementDirection,
    driverId: c.driverId,
    mutatesOrderMajors: false,
    historicalReRateForbidden: true,
    settlementV2: false,
    financePilot: false,
    synthetic: false,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    createdByUserId: input.actorUid,
    createdAtUtc: input.createdAtUtc,
    fc01PolicyId: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.policyId,
    fc01PolicyVersion: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version,
  };
}

export function buildProductionAccountingSnapshotAuditIntentDoc(input: {
  id: string;
  orderId: string;
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
    resourceId: input.orderId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    source: "order",
    financePilot: false,
    synthetic: false,
  };
}

export function buildProductionAccountingSnapshotAuditResultDoc(input: {
  id: string;
  snapshotId: string;
  actorUid: string;
  correlationId: string;
  idempotencyKey: string;
  atUtc: string;
  outcome: "applied" | "already_applied";
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
    outcome: input.outcome,
    source: "order",
    financePilot: false,
    synthetic: false,
  };
}

export function buildProductionAccountingSnapshotIdempotencyDoc(input: {
  key: string;
  orderId: string;
  snapshotId: string;
  actorUid: string;
  correlationId: string;
  auditIntentId: string;
  auditResultId: string;
  createdAtUtc: string;
  clientKey: string;
}): Record<string, unknown> {
  return {
    key: input.key,
    op: "snapshot.materialize",
    clientKey: input.clientKey,
    schemaVersion: ACCOUNTING_SNAPSHOT_SCHEMA_VERSION,
    source: "order",
    sourceCollection: "order",
    orderId: input.orderId,
    snapshotId: input.snapshotId,
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
    financePilot: false,
    synthetic: false,
  };
}

export function sanitizeIdempotencyDocId(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 700);
}
