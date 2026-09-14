/**
 * Phase 5N — deterministic metadata reconciliation planner.
 *
 * Rules:
 * - Never plan Driver / Auth / Finance / Trip / Agent / Customer writes.
 * - Never re-execute RequestDriverChangesCommand.
 * - Create-only success AUDIT_RESULT when missing.
 * - Minimum idempotency patch for empty/missing auditResultId only.
 * - Already-complete → no writes.
 * - Conflicting / ambiguous → NO-GO (no writes).
 * - Exceeding minimum metadata write budget → NO-GO.
 */

import {
  PHASE_5N_KNOWN_FAILURE_RESULT_AUDIT_ID,
  PHASE_5N_MAX_METADATA_WRITES,
  PHASE_5N_ORIGINAL_CORRELATION_ID,
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
} from "@/application/controlled-writes/pilot/Phase5NConstants";
import {
  buildPhase5NExpectedWriteCounts,
  PHASE_5N_ZERO_WRITE_COUNTS,
  type Phase5NExpectedWriteCounts,
} from "@/application/controlled-writes/pilot/Phase5NExpectedWriteCounts";
import type { Phase5NObservedMetadata } from "@/application/controlled-writes/pilot/Phase5NObservedMetadata";
import {
  buildPhase5NIdempotencyAuditResultIdPatch,
  buildPhase5NSuccessAuditResultPayload,
  emptyPhase5NExactPlannedMetadataDiff,
  phase5NPlannedSuccessResultDocumentId,
  type Phase5NExactPlannedMetadataDiff,
} from "@/application/controlled-writes/pilot/Phase5NPlannedMetadataDiff";

export type Phase5NAuditIntentStatus =
  | "present_ok"
  | "missing"
  | "mismatch"
  | "unknown";

export type Phase5NAuditResultStatus =
  | "success_present"
  | "missing_success_failure_residue_ok"
  | "missing_success"
  | "ambiguous_multiple_success"
  | "conflict"
  | "unknown";

export type Phase5NIdempotencyStatus =
  | "complete"
  | "incomplete_missing_audit_result_id"
  | "missing"
  | "mismatch"
  | "conflict"
  | "unknown";

export type Phase5NReconciliationDecision =
  | "NO_WRITE_ALREADY_COMPLETE"
  | "PLAN_METADATA_RECONCILE"
  | "NO_GO_CONFLICT"
  | "NO_GO_PRECONDITION";

export type Phase5NReconciliationPlan = {
  readonly decision: Phase5NReconciliationDecision;
  readonly overallStatus:
    | "PHASE5N_METADATA_RECONCILE_ALREADY_COMPLETE"
    | "PHASE5N_METADATA_RECONCILE_PLAN_READY"
    | "PHASE5N_METADATA_RECONCILE_NO_GO";
  readonly goNoGo: "GO" | "NO-GO";
  readonly driverState: string | null;
  readonly driverDomainWriteRequired: false;
  readonly originalOperationIdentified: boolean;
  readonly auditIntentStatus: Phase5NAuditIntentStatus;
  readonly auditResultStatus: Phase5NAuditResultStatus;
  readonly idempotencyStatus: Phase5NIdempotencyStatus;
  readonly metadataInconsistencies: readonly string[];
  readonly exactPlannedMetadataDiff: Phase5NExactPlannedMetadataDiff;
  readonly exactExpectedWriteCounts: Phase5NExpectedWriteCounts;
  readonly reconciliationIdempotent: boolean;
  readonly conflictingMetadataDetected: boolean;
  readonly authClaimsRepairRequired: false;
  readonly forbiddenDomainWrites: 0;
  readonly denials: readonly string[];
  readonly blocker: string | null;
};

function successResults(observed: Phase5NObservedMetadata) {
  return observed.auditResults.filter(
    (r) =>
      r.kind === "AUDIT_RESULT" &&
      r.outcome === "applied" &&
      r.intentAuditId === PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
  );
}

function failureResidueOk(observed: Phase5NObservedMetadata): boolean {
  const failures = observed.auditResults.filter(
    (r) =>
      r.kind === "AUDIT_RESULT" &&
      r.outcome === "failed" &&
      r.intentAuditId === PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
  );
  if (failures.length === 0) return true;
  // Known Phase 5M catch-path residue is acceptable; any other failure shape → conflict.
  return failures.every(
    (f) =>
      f.auditId === PHASE_5N_KNOWN_FAILURE_RESULT_AUDIT_ID &&
      f.code === "INTERNAL_WRITE_FAILURE" &&
      f.idempotencyKey === PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  );
}

export function planPhase5NMetadataReconciliation(
  observed: Phase5NObservedMetadata,
  opts?: { plannedSuccessAuditId?: string },
): Phase5NReconciliationPlan {
  const inconsistencies: string[] = [];
  const denials: string[] = [];
  let conflicting = false;

  const intent = observed.auditIntent;
  let auditIntentStatus: Phase5NAuditIntentStatus = "unknown";
  if (!intent) {
    auditIntentStatus = "missing";
    inconsistencies.push("audit_intent_missing");
  } else if (
    intent.auditId !== PHASE_5N_ORIGINAL_INTENT_AUDIT_ID ||
    intent.idempotencyKey !== PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY ||
    intent.correlationId !== PHASE_5N_ORIGINAL_CORRELATION_ID ||
    intent.action !== "needs_changes" ||
    intent.fromState !== "pending_review" ||
    intent.toState !== "needs_changes"
  ) {
    auditIntentStatus = "mismatch";
    conflicting = true;
    inconsistencies.push("audit_intent_mismatch");
  } else {
    auditIntentStatus = "present_ok";
  }

  const applied = successResults(observed);
  let auditResultStatus: Phase5NAuditResultStatus = "unknown";
  if (applied.length > 1) {
    auditResultStatus = "ambiguous_multiple_success";
    conflicting = true;
    inconsistencies.push("multiple_success_audit_results");
  } else if (applied.length === 1) {
    const s = applied[0]!;
    if (
      s.action !== "needs_changes" ||
      s.toState !== "needs_changes" ||
      s.idempotencyKey !== PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY ||
      s.hasUndefinedCodeField === true ||
      (s.code !== undefined && s.code !== "")
    ) {
      auditResultStatus = "conflict";
      conflicting = true;
      inconsistencies.push("success_audit_result_conflict");
    } else {
      auditResultStatus = "success_present";
    }
  } else if (!failureResidueOk(observed)) {
    auditResultStatus = "conflict";
    conflicting = true;
    inconsistencies.push("unexpected_failure_audit_result");
  } else if (
    observed.auditResults.some(
      (r) =>
        r.outcome === "failed" &&
        r.auditId === PHASE_5N_KNOWN_FAILURE_RESULT_AUDIT_ID,
    )
  ) {
    auditResultStatus = "missing_success_failure_residue_ok";
    inconsistencies.push("success_audit_result_missing");
  } else {
    auditResultStatus = "missing_success";
    inconsistencies.push("success_audit_result_missing");
  }

  const idem = observed.idempotency;
  let idempotencyStatus: Phase5NIdempotencyStatus = "unknown";
  if (!idem) {
    idempotencyStatus = "missing";
    inconsistencies.push("idempotency_missing");
  } else if (idem.key !== PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY) {
    idempotencyStatus = "mismatch";
    conflicting = true;
    inconsistencies.push("idempotency_key_mismatch");
  } else if (
    idem.result.ok !== true ||
    idem.result.status !== "applied" ||
    idem.result.toState !== "needs_changes" ||
    idem.result.auditIntentId !== PHASE_5N_ORIGINAL_INTENT_AUDIT_ID
  ) {
    idempotencyStatus = "conflict";
    conflicting = true;
    inconsistencies.push("idempotency_result_conflict");
  } else if (!idem.result.auditResultId?.trim()) {
    idempotencyStatus = "incomplete_missing_audit_result_id";
    inconsistencies.push("idempotency_audit_result_id_empty");
  } else if (
    applied.length === 1 &&
    idem.result.auditResultId !== applied[0]!.auditId
  ) {
    idempotencyStatus = "conflict";
    conflicting = true;
    inconsistencies.push("idempotency_audit_result_id_mismatch");
  } else {
    idempotencyStatus = "complete";
  }

  const originalOperationIdentified =
    auditIntentStatus === "present_ok" &&
    (idempotencyStatus === "complete" ||
      idempotencyStatus === "incomplete_missing_audit_result_id");

  if (observed.driverState !== "needs_changes") {
    denials.push("driver_state_not_needs_changes");
    conflicting = true;
    inconsistencies.push(
      `driver_state=${observed.driverState ?? "null"} expected=needs_changes`,
    );
  }

  // Auth claims repair never required / never planned.
  if (observed.auth && observed.auth.exists && observed.auth.disabled !== true) {
    // Informational only — do not plan Auth writes; may still reconcile metadata.
    inconsistencies.push("auth_disabled_unexpected");
  }

  const baseNoWrite = (): Phase5NReconciliationPlan => ({
    decision: "NO_GO_CONFLICT",
    overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
    goNoGo: "NO-GO",
    driverState: observed.driverState,
    driverDomainWriteRequired: false,
    originalOperationIdentified,
    auditIntentStatus,
    auditResultStatus,
    idempotencyStatus,
    metadataInconsistencies: inconsistencies,
    exactPlannedMetadataDiff: emptyPhase5NExactPlannedMetadataDiff(),
    exactExpectedWriteCounts: PHASE_5N_ZERO_WRITE_COUNTS,
    reconciliationIdempotent: true,
    conflictingMetadataDetected: conflicting,
    authClaimsRepairRequired: false,
    forbiddenDomainWrites: 0,
    denials,
    blocker: denials[0] ?? inconsistencies[0] ?? "NO_GO",
  });

  if (conflicting || denials.length > 0) {
    return {
      ...baseNoWrite(),
      decision: "NO_GO_CONFLICT",
      denials: denials.length > 0 ? denials : ["conflicting_metadata"],
    };
  }

  if (
    auditIntentStatus !== "present_ok" ||
    !originalOperationIdentified ||
    idempotencyStatus === "missing"
  ) {
    return {
      ...baseNoWrite(),
      decision: "NO_GO_PRECONDITION",
      overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
      goNoGo: "NO-GO",
      conflictingMetadataDetected: false,
      denials: ["original_operation_incomplete_for_safe_reconcile"],
      blocker: "original_operation_incomplete_for_safe_reconcile",
    };
  }

  // Already complete: success RESULT + idempotency points at it.
  if (
    auditResultStatus === "success_present" &&
    idempotencyStatus === "complete"
  ) {
    return {
      decision: "NO_WRITE_ALREADY_COMPLETE",
      overallStatus: "PHASE5N_METADATA_RECONCILE_ALREADY_COMPLETE",
      goNoGo: "NO-GO",
      driverState: observed.driverState,
      driverDomainWriteRequired: false,
      originalOperationIdentified: true,
      auditIntentStatus,
      auditResultStatus,
      idempotencyStatus,
      metadataInconsistencies: [],
      exactPlannedMetadataDiff: emptyPhase5NExactPlannedMetadataDiff(),
      exactExpectedWriteCounts: PHASE_5N_ZERO_WRITE_COUNTS,
      reconciliationIdempotent: true,
      conflictingMetadataDetected: false,
      authClaimsRepairRequired: false,
      forbiddenDomainWrites: 0,
      denials: ["already_complete_no_write"],
      blocker: "already_complete — no metadata write required",
    };
  }

  // Success present but idempotency incomplete → patch only (min).
  // Success missing → create + patch.
  let successCreates = 0;
  let idemPatches = 0;
  let successAuditResultCreate: Phase5NExactPlannedMetadataDiff["successAuditResultCreate"] =
    null;
  let idempotencyPatch: Phase5NExactPlannedMetadataDiff["idempotencyPatch"] =
    null;

  const plannedSuccessId =
    opts?.plannedSuccessAuditId ??
    (applied[0]?.auditId || phase5NPlannedSuccessResultDocumentId());

  if (
    auditResultStatus === "missing_success" ||
    auditResultStatus === "missing_success_failure_residue_ok"
  ) {
    successCreates = 1;
    const payload = buildPhase5NSuccessAuditResultPayload({
      auditId: plannedSuccessId,
      driverId: intent!.driverId,
      countryId: intent!.countryId,
      fromState: "pending_review",
      toState: "needs_changes",
      createdAtUtc: "1970-01-01T00:00:00.000Z", // dry-run placeholder; apply replaces
    });
    // Dry-run must show code omitted.
    if (Object.prototype.hasOwnProperty.call(payload, "code")) {
      return {
        ...baseNoWrite(),
        decision: "NO_GO_CONFLICT",
        denials: ["planned_success_result_contains_code_field"],
        blocker: "planned_success_result_contains_code_field",
      };
    }
    successAuditResultCreate = {
      op: "create",
      collection: "admin_next_cw_audit",
      documentId: plannedSuccessId,
      precondition: "create-only",
      payload,
    };
  }

  const targetResultId =
    applied[0]?.auditId ??
    successAuditResultCreate?.documentId ??
    plannedSuccessId;

  if (idempotencyStatus === "incomplete_missing_audit_result_id") {
    idemPatches = 1;
    idempotencyPatch =
      buildPhase5NIdempotencyAuditResultIdPatch(targetResultId);
  }

  // If success was missing but idempotency somehow complete pointing elsewhere —
  // already conflict-gated. If success missing and idempotency complete with
  // non-empty id that doesn't exist → conflict.
  if (
    successCreates === 1 &&
    idempotencyStatus === "complete" &&
    idem!.result.auditResultId.trim() !== ""
  ) {
    return {
      ...baseNoWrite(),
      decision: "NO_GO_CONFLICT",
      denials: ["idempotency_points_to_missing_success_result"],
      blocker: "idempotency_points_to_missing_success_result",
      conflictingMetadataDetected: true,
    };
  }

  // When creating success RESULT, idempotency must be patched.
  if (successCreates === 1 && idemPatches === 0) {
    if (idempotencyStatus === "incomplete_missing_audit_result_id") {
      idemPatches = 1;
      idempotencyPatch =
        buildPhase5NIdempotencyAuditResultIdPatch(targetResultId);
    } else {
      return {
        ...baseNoWrite(),
        decision: "NO_GO_CONFLICT",
        denials: ["cannot_create_success_without_idempotency_patch_path"],
        blocker: "cannot_create_success_without_idempotency_patch_path",
      };
    }
  }

  const counts = buildPhase5NExpectedWriteCounts({
    successAuditResultCreates: successCreates,
    idempotencyPatches: idemPatches,
  });

  if (counts.metadataWrites === 0) {
    return {
      ...baseNoWrite(),
      decision: "NO_GO_PRECONDITION",
      denials: ["no_safe_metadata_writes_derived"],
      blocker: "no_safe_metadata_writes_derived",
      conflictingMetadataDetected: false,
    };
  }

  if (counts.metadataWrites > PHASE_5N_MAX_METADATA_WRITES) {
    return {
      ...baseNoWrite(),
      decision: "NO_GO_CONFLICT",
      denials: ["metadata_writes_exceed_minimum_budget"],
      blocker: "metadata_writes_exceed_minimum_budget",
      exactExpectedWriteCounts: counts,
    };
  }

  // Bound: domain etc must be 0 (enforced by type + builder).
  if (
    counts.driverDomainWrites !== 0 ||
    counts.auditIntentWrites !== 0 ||
    counts.authClaimWrites !== 0
  ) {
    return {
      ...baseNoWrite(),
      decision: "NO_GO_CONFLICT",
      denials: ["forbidden_non_metadata_writes_planned"],
      blocker: "forbidden_non_metadata_writes_planned",
    };
  }

  return {
    decision: "PLAN_METADATA_RECONCILE",
    overallStatus: "PHASE5N_METADATA_RECONCILE_PLAN_READY",
    goNoGo: "GO",
    driverState: observed.driverState,
    driverDomainWriteRequired: false,
    originalOperationIdentified: true,
    auditIntentStatus,
    auditResultStatus,
    idempotencyStatus,
    metadataInconsistencies: inconsistencies,
    exactPlannedMetadataDiff: {
      successAuditResultCreate,
      idempotencyPatch,
      domainWrites: [],
      authClaimWrites: [],
      financeWrites: [],
      tripWrites: [],
      agentWrites: [],
      customerWrites: [],
    },
    exactExpectedWriteCounts: counts,
    reconciliationIdempotent: true,
    conflictingMetadataDetected: false,
    authClaimsRepairRequired: false,
    forbiddenDomainWrites: 0,
    denials: [],
    blocker: null,
  };
}
