/**
 * Phase 5M — exact expected write counts + consolidated service write order.
 * Derived from executeDriverControlledWrite + Production syncUserClaimsOnWrite.
 */

export const PHASE_5M_EXPECTED_WRITE_COUNTS = {
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

export const PHASE_5M_SESSION_ZERO_WRITE_COUNTS = {
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

export type Phase5MExpectedWriteCounts = typeof PHASE_5M_EXPECTED_WRITE_COUNTS;

/**
 * Actual consolidated Driver pipeline order (executeDriverControlledWrite):
 * 1. verified actor / validation / Production flags (Phase5M gates in harness)
 * 2. RBAC → load snapshot → scope → precondition/transition
 * 3. idempotency GET
 * 4. AUDIT_INTENT create (fail-closed — no domain write without intent)
 * 5. controlled repository allowlisted update (driverDomainWrites=1)
 * 6. idempotency PUT (logical surface; may overwrite once with auditResultId)
 * 7. AUDIT_RESULT create
 * 8. async CF syncUserClaimsOnWrite → setCustomUserClaims (authClaimWrites=1)
 */
export const PHASE_5M_CONSOLIDATED_WRITE_ORDER = [
  "verified_actor",
  "rbac",
  "scope",
  "precondition_transition",
  "idempotency_get",
  "audit_intent",
  "controlled_repo_domain_update",
  "idempotency_put",
  "audit_result",
  "syncUserClaimsOnWrite_setCustomUserClaims",
] as const;

export function planPhase5MExactWriteCounts(): Phase5MExpectedWriteCounts {
  return { ...PHASE_5M_EXPECTED_WRITE_COUNTS };
}
