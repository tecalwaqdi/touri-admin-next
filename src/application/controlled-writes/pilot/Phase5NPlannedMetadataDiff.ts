/**
 * Phase 5N — exact planned metadata diff (create-only RESULT + min idempotency patch).
 * Never plans Driver/Auth/Finance/Trip/Agent/Customer writes.
 */

import type { DriverWriteAuditResult } from "@/application/controlled-writes/drivers/DriverWriteAudit";
import { omitUndefinedDeep } from "@/application/controlled-writes/omitUndefinedForFirestore";
import {
  PHASE_5N_AUDIT_COLLECTION,
  PHASE_5N_AUDIT_PHASE_TAG,
  PHASE_5N_IDEMPOTENCY_COLLECTION,
  PHASE_5N_ORIGINAL_CORRELATION_ID,
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
} from "@/application/controlled-writes/pilot/Phase5NConstants";

export type Phase5NPlannedSuccessResultCreate = {
  readonly op: "create";
  readonly collection: typeof PHASE_5N_AUDIT_COLLECTION;
  /** Placeholder until apply generates id; dry-run may use planned id. */
  readonly documentId: string;
  readonly precondition: "create-only";
  readonly payload: Record<string, unknown>;
};

export type Phase5NPlannedIdempotencyPatch = {
  readonly op: "set_merge";
  readonly collection: typeof PHASE_5N_IDEMPOTENCY_COLLECTION;
  readonly documentId: typeof PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY;
  readonly precondition: "exists";
  /** Minimum fields only — nested result.auditResultId. */
  readonly patch: {
    readonly result: {
      readonly auditResultId: string;
    };
  };
};

export type Phase5NExactPlannedMetadataDiff = {
  readonly successAuditResultCreate: Phase5NPlannedSuccessResultCreate | null;
  readonly idempotencyPatch: Phase5NPlannedIdempotencyPatch | null;
  readonly domainWrites: readonly never[];
  readonly authClaimWrites: readonly never[];
  readonly financeWrites: readonly never[];
  readonly tripWrites: readonly never[];
  readonly agentWrites: readonly never[];
  readonly customerWrites: readonly never[];
};

export function emptyPhase5NExactPlannedMetadataDiff(): Phase5NExactPlannedMetadataDiff {
  return {
    successAuditResultCreate: null,
    idempotencyPatch: null,
    domainWrites: [],
    authClaimWrites: [],
    financeWrites: [],
    tripWrites: [],
    agentWrites: [],
    customerWrites: [],
  };
}

/**
 * Build success AUDIT_RESULT Firestore payload for create-only reconciliation.
 * Omits `code` entirely (never persist undefined).
 */
export function buildPhase5NSuccessAuditResultPayload(input: {
  auditId: string;
  driverId: string;
  countryId: string | null;
  fromState: string;
  toState: string;
  createdAtUtc?: string;
}): Record<string, unknown> {
  const result: DriverWriteAuditResult & { phase: string } = {
    kind: "AUDIT_RESULT",
    auditId: input.auditId,
    intentAuditId: PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
    outcome: "applied",
    resource: "driver",
    action: "needs_changes",
    driverId: input.driverId,
    countryId: input.countryId,
    fromState: input.fromState as DriverWriteAuditResult["fromState"],
    toState: input.toState as DriverWriteAuditResult["toState"],
    idempotencyKey: PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
    correlationId: PHASE_5N_ORIGINAL_CORRELATION_ID,
    productionWriteExecuted: false,
    createdAtUtc: input.createdAtUtc ?? new Date().toISOString(),
    phase: PHASE_5N_AUDIT_PHASE_TAG,
  };
  // Explicitly never set code on success.
  const payload = omitUndefinedDeep(result) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(payload, "code")) {
    delete payload.code;
  }
  return payload;
}

export function buildPhase5NIdempotencyAuditResultIdPatch(
  successAuditResultId: string,
): Phase5NPlannedIdempotencyPatch {
  return {
    op: "set_merge",
    collection: PHASE_5N_IDEMPOTENCY_COLLECTION,
    documentId: PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
    precondition: "exists",
    patch: {
      result: {
        auditResultId: successAuditResultId,
      },
    },
  };
}

/** Deterministic dry-run placeholder id — apply must still use create-only. */
export function phase5NPlannedSuccessResultDocumentId(
  suffix = "reconcile",
): string {
  return `dwr_phase5n_${suffix}`;
}
