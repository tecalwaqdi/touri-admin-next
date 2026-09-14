/**
 * Phase 5L — exact future write counts for ONE real RequestDriverChanges apply.
 * Derived from DriverControlledWriteService + Production syncUserClaimsOnWrite.
 * Dry-run session itself: all actual writes remain 0.
 */

/**
 * Future REAL Pilot counts (NOT executed in Phase 5L).
 *
 * From `executeDriverControlledWrite`:
 * - driverDomainWrites 1 → repository.apply (allowlisted registration_status)
 * - auditIntentWrites 1 → audit.recordIntent
 * - auditResultWrites 1 → audit.recordResult
 * - idempotencyWrites 1 → logical idempotency key put (service may overwrite same key
 *   once after auditResultId fill; counted as one idempotency record write surface)
 *
 * From Production Cloud Function syncUserClaimsOnWrite on user/{uid} update:
 * - authClaimWrites 1 → ALWAYS setCustomUserClaims even when claims payload unchanged
 *
 * Isolation:
 * - financeWrites / tripWrites / agentWrites / customerWrites = 0
 */
export const PHASE_5L_EXPECTED_FUTURE_WRITE_COUNTS = {
  driverDomainWrites: 1,
  auditIntentWrites: 1,
  auditResultWrites: 1,
  idempotencyWrites: 1,
  authClaimWrites: 1,
  financeWrites: 0,
  tripWrites: 0,
  agentWrites: 0,
  customerWrites: 0,
} as const;

/** This dry-run session — no mutations. */
export const PHASE_5L_DRY_RUN_SESSION_WRITE_COUNTS = {
  driverDomainWrites: 0,
  auditIntentWrites: 0,
  auditResultWrites: 0,
  idempotencyWrites: 0,
  authClaimWrites: 0,
  financeWrites: 0,
  tripWrites: 0,
  agentWrites: 0,
  customerWrites: 0,
  productionWrites: 0,
} as const;

export type Phase5LExactFutureWriteCounts =
  typeof PHASE_5L_EXPECTED_FUTURE_WRITE_COUNTS;

export function planPhase5LExactFutureWriteCounts(): Phase5LExactFutureWriteCounts {
  return { ...PHASE_5L_EXPECTED_FUTURE_WRITE_COUNTS };
}
