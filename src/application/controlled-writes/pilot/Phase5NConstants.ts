/**
 * Phase 5N — original Phase 5M logical operation identity.
 * Reconcile metadata for THIS operation only — never invent a second logical op.
 */

import { PHASE_5M_PILOT_IDEMPOTENCY_KEY } from "@/application/controlled-writes/pilot/isPhase5MDriverPilotApplyEnabled";
import {
  PHASE_5M_AUDIT_COLLECTION,
  PHASE_5M_IDEMPOTENCY_COLLECTION,
} from "@/application/controlled-writes/pilot/Phase5MIamDerivation";

/** Same Pilot key as Phase 5L/5M — no second logical operation. */
export const PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY =
  PHASE_5M_PILOT_IDEMPOTENCY_KEY;

/** Original AUDIT_INTENT id from the Phase 5M Apply that committed domain. */
export const PHASE_5N_ORIGINAL_INTENT_AUDIT_ID =
  "dwi_mtza5vca_4y4zsr1v" as const;

/**
 * Catch-path failure RESULT written after success RESULT create rejected
 * (`code: undefined`). Historical residue — must NOT be overwritten.
 */
export const PHASE_5N_KNOWN_FAILURE_RESULT_AUDIT_ID =
  "dwr_mtza5xc7_ssxaoeie" as const;

export const PHASE_5N_ORIGINAL_CORRELATION_ID =
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY;

export const PHASE_5N_AUDIT_COLLECTION = PHASE_5M_AUDIT_COLLECTION;
export const PHASE_5N_IDEMPOTENCY_COLLECTION = PHASE_5M_IDEMPOTENCY_COLLECTION;

/** Completing Phase 5M records — keep phase tag consistent with original path. */
export const PHASE_5N_AUDIT_PHASE_TAG = "5M" as const;

/**
 * Narrow metadata write budget for the known incomplete Production state.
 * Exceeding this → NO-GO.
 */
export const PHASE_5N_MINIMUM_EXPECTED_METADATA_WRITES = {
  successAuditResultCreates: 1,
  idempotencyPatches: 1,
  auditIntentWrites: 0,
  driverDomainWrites: 0,
  authClaimWrites: 0,
  financeWrites: 0,
  tripWrites: 0,
  agentWrites: 0,
  customerWrites: 0,
} as const;

export const PHASE_5N_MAX_METADATA_WRITES =
  PHASE_5N_MINIMUM_EXPECTED_METADATA_WRITES.successAuditResultCreates +
  PHASE_5N_MINIMUM_EXPECTED_METADATA_WRITES.idempotencyPatches;
