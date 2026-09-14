/**
 * Phase 5N — safe reconciliation summary (no UID / tokens / PII).
 */

import type { Phase5NExpectedWriteCounts } from "@/application/controlled-writes/pilot/Phase5NExpectedWriteCounts";
import { PHASE_5N_ZERO_WRITE_COUNTS } from "@/application/controlled-writes/pilot/Phase5NExpectedWriteCounts";
import type {
  Phase5NAuditIntentStatus,
  Phase5NAuditResultStatus,
  Phase5NIdempotencyStatus,
  Phase5NReconciliationPlan,
} from "@/application/controlled-writes/pilot/Phase5NReconciliationPlanner";
import type { Phase5NExactPlannedMetadataDiff } from "@/application/controlled-writes/pilot/Phase5NPlannedMetadataDiff";
import { emptyPhase5NExactPlannedMetadataDiff } from "@/application/controlled-writes/pilot/Phase5NPlannedMetadataDiff";
import {
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
} from "@/application/controlled-writes/pilot/Phase5NConstants";

export type Phase5NOverallStatus =
  | "SKIPPED"
  | "PENDING_OPERATOR"
  | "PHASE5N_METADATA_RECONCILE_ALREADY_COMPLETE"
  | "PHASE5N_METADATA_RECONCILE_PLAN_READY"
  | "PHASE5N_METADATA_RECONCILE_NO_GO"
  | "PHASE5N_METADATA_RECONCILE_DRY_RUN_PASS"
  | "PHASE5N_METADATA_RECONCILE_APPLY_STUB";

export type Phase5NReconciliationSafeSummary = {
  overallStatus: Phase5NOverallStatus;
  harnessArmed: boolean;
  dryRunExecuted: boolean;
  liveReadAttempted: boolean;
  applyAttempted: false;
  productionWrites: 0;
  actualMetadataWrites: 0;

  driverState: string | null;
  driverDomainWriteRequired: false;
  originalOperationIdentified: boolean;
  originalIdempotencyKeyLogical: typeof PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY;
  originalIntentAuditId: typeof PHASE_5N_ORIGINAL_INTENT_AUDIT_ID;

  auditIntentStatus: Phase5NAuditIntentStatus | null;
  auditResultStatus: Phase5NAuditResultStatus | null;
  idempotencyStatus: Phase5NIdempotencyStatus | null;
  metadataInconsistencies: readonly string[];

  exactPlannedMetadataDiff: Phase5NExactPlannedMetadataDiff;
  exactExpectedWriteCounts: Phase5NExpectedWriteCounts;

  reconciliationIdempotent: boolean;
  conflictingMetadataDetected: boolean;
  authClaimsRepairRequired: false;
  forbiddenDomainWrites: 0;

  goNoGo: "GO" | "NO-GO" | "SKIPPED";
  decision: string | null;
  denials: readonly string[];
  blocker: string | null;

  productionReads: number;
  authDisabled: boolean | null;
  authClaimsKeys: readonly string[];
};

export function emptyPhase5NReconciliationSafeSummary(
  overrides?: Partial<Phase5NReconciliationSafeSummary>,
): Phase5NReconciliationSafeSummary {
  return {
    overallStatus: "SKIPPED",
    harnessArmed: false,
    dryRunExecuted: false,
    liveReadAttempted: false,
    applyAttempted: false,
    productionWrites: 0,
    actualMetadataWrites: 0,
    driverState: null,
    driverDomainWriteRequired: false,
    originalOperationIdentified: false,
    originalIdempotencyKeyLogical: PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
    originalIntentAuditId: PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
    auditIntentStatus: null,
    auditResultStatus: null,
    idempotencyStatus: null,
    metadataInconsistencies: [],
    exactPlannedMetadataDiff: emptyPhase5NExactPlannedMetadataDiff(),
    exactExpectedWriteCounts: PHASE_5N_ZERO_WRITE_COUNTS,
    reconciliationIdempotent: true,
    conflictingMetadataDetected: false,
    authClaimsRepairRequired: false,
    forbiddenDomainWrites: 0,
    goNoGo: "SKIPPED",
    decision: null,
    denials: [],
    blocker: null,
    productionReads: 0,
    authDisabled: null,
    authClaimsKeys: [],
    ...overrides,
  };
}

/**
 * Redact driverId from planned payloads before writing safe summary.
 */
export function redactPhase5NPlannedDiffForSafeSummary(
  diff: Phase5NExactPlannedMetadataDiff,
): Phase5NExactPlannedMetadataDiff {
  if (!diff.successAuditResultCreate) return diff;
  const payload = { ...diff.successAuditResultCreate.payload };
  if ("driverId" in payload) {
    payload.driverId = "<redacted>";
  }
  return {
    ...diff,
    successAuditResultCreate: {
      ...diff.successAuditResultCreate,
      payload,
    },
  };
}

export function summaryFromPhase5NPlan(
  plan: Phase5NReconciliationPlan,
  extras?: Partial<Phase5NReconciliationSafeSummary>,
): Phase5NReconciliationSafeSummary {
  return emptyPhase5NReconciliationSafeSummary({
    overallStatus: plan.overallStatus,
    dryRunExecuted: true,
    driverState: plan.driverState,
    driverDomainWriteRequired: false,
    originalOperationIdentified: plan.originalOperationIdentified,
    auditIntentStatus: plan.auditIntentStatus,
    auditResultStatus: plan.auditResultStatus,
    idempotencyStatus: plan.idempotencyStatus,
    metadataInconsistencies: plan.metadataInconsistencies,
    exactPlannedMetadataDiff: redactPhase5NPlannedDiffForSafeSummary(
      plan.exactPlannedMetadataDiff,
    ),
    exactExpectedWriteCounts: plan.exactExpectedWriteCounts,
    reconciliationIdempotent: plan.reconciliationIdempotent,
    conflictingMetadataDetected: plan.conflictingMetadataDetected,
    authClaimsRepairRequired: false,
    forbiddenDomainWrites: 0,
    goNoGo: plan.goNoGo,
    decision: plan.decision,
    denials: plan.denials,
    blocker: plan.blocker,
    ...extras,
  });
}
