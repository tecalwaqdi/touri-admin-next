/**
 * Phase 5N — live metadata reconcile apply safe summary (§13).
 * No UID / tokens / PII.
 */

import type { Phase5NExpectedWriteCounts } from "@/application/controlled-writes/pilot/Phase5NExpectedWriteCounts";
import { PHASE_5N_ZERO_WRITE_COUNTS } from "@/application/controlled-writes/pilot/Phase5NExpectedWriteCounts";
import type {
  Phase5NAuditIntentStatus,
  Phase5NAuditResultStatus,
  Phase5NIdempotencyStatus,
} from "@/application/controlled-writes/pilot/Phase5NReconciliationPlanner";
import type { Phase5NExactPlannedMetadataDiff } from "@/application/controlled-writes/pilot/Phase5NPlannedMetadataDiff";
import { emptyPhase5NExactPlannedMetadataDiff } from "@/application/controlled-writes/pilot/Phase5NPlannedMetadataDiff";
import {
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
} from "@/application/controlled-writes/pilot/Phase5NConstants";

export type Phase5NApplyOverallStatus =
  | "SKIPPED"
  | "PENDING_OPERATOR"
  | "GATED_REFUSED"
  | "PHASE5N_METADATA_RECONCILE_ALREADY_RECONCILED"
  | "PHASE5N_METADATA_RECONCILE_NO_GO"
  | "PHASE5N_METADATA_RECONCILE_PASS"
  | "PHASE5N_METADATA_RECONCILE_APPLY_STUB";

export type Phase5NApplySafeSummary = {
  overallStatus: Phase5NApplyOverallStatus;
  harnessArmed: boolean;
  applyAttempted: boolean;
  alreadyReconciled: boolean;

  driverStateBefore: string | null;
  driverStateAfter: string | null;
  originalOperationIdentified: boolean;
  originalIdempotencyKeyLogical: typeof PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY;
  originalIntentAuditId: typeof PHASE_5N_ORIGINAL_INTENT_AUDIT_ID;

  auditIntentStatus: Phase5NAuditIntentStatus | null;
  auditResultStatusBefore: Phase5NAuditResultStatus | null;
  auditResultStatusAfter: Phase5NAuditResultStatus | null;
  idempotencyStatusBefore: Phase5NIdempotencyStatus | null;
  idempotencyStatusAfter: Phase5NIdempotencyStatus | null;

  exactAppliedMetadataDiff: Phase5NExactPlannedMetadataDiff;
  exactExpectedWriteCounts: Phase5NExpectedWriteCounts;

  actualSuccessAuditResultCreates: number;
  actualIdempotencyPatches: number;
  metadataWrites: number;
  driverDomainWrites: 0 | number;
  authClaimWrites: 0 | number;
  financeWrites: 0 | number;
  tripWrites: 0 | number;
  agentWrites: 0 | number;
  customerWrites: 0 | number;

  reconciliationVerified: boolean;
  conflictingMetadataDetected: boolean;
  forbiddenWritesZero: boolean;
  driverDomainWriteRequired: false;
  authClaimsRepairRequired: false;

  goNoGo: "GO" | "NO-GO" | "SKIPPED";
  decision: string | null;
  denials: readonly string[];
  blocker: string | null;

  productionReads: number;
  productionWrites: number;
};

export function emptyPhase5NApplySafeSummary(
  overrides?: Partial<Phase5NApplySafeSummary>,
): Phase5NApplySafeSummary {
  return {
    overallStatus: "SKIPPED",
    harnessArmed: false,
    applyAttempted: false,
    alreadyReconciled: false,
    driverStateBefore: null,
    driverStateAfter: null,
    originalOperationIdentified: false,
    originalIdempotencyKeyLogical: PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
    originalIntentAuditId: PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
    auditIntentStatus: null,
    auditResultStatusBefore: null,
    auditResultStatusAfter: null,
    idempotencyStatusBefore: null,
    idempotencyStatusAfter: null,
    exactAppliedMetadataDiff: emptyPhase5NExactPlannedMetadataDiff(),
    exactExpectedWriteCounts: PHASE_5N_ZERO_WRITE_COUNTS,
    actualSuccessAuditResultCreates: 0,
    actualIdempotencyPatches: 0,
    metadataWrites: 0,
    driverDomainWrites: 0,
    authClaimWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    reconciliationVerified: false,
    conflictingMetadataDetected: false,
    forbiddenWritesZero: true,
    driverDomainWriteRequired: false,
    authClaimsRepairRequired: false,
    goNoGo: "SKIPPED",
    decision: null,
    denials: [],
    blocker: null,
    productionReads: 0,
    productionWrites: 0,
    ...overrides,
  };
}

export function evaluatePhase5NApplyPassConditions(input: {
  actualSuccessAuditResultCreates: number;
  actualIdempotencyPatches: number;
  metadataWrites: number;
  driverDomainWrites: number;
  authClaimWrites: number;
  financeWrites: number;
  tripWrites: number;
  agentWrites: number;
  customerWrites: number;
  reconciliationVerified: boolean;
}): boolean {
  return (
    input.actualSuccessAuditResultCreates === 1 &&
    input.actualIdempotencyPatches === 1 &&
    input.metadataWrites === 2 &&
    input.driverDomainWrites === 0 &&
    input.authClaimWrites === 0 &&
    input.financeWrites === 0 &&
    input.tripWrites === 0 &&
    input.agentWrites === 0 &&
    input.customerWrites === 0 &&
    input.reconciliationVerified === true
  );
}
