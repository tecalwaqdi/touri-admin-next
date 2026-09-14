/**
 * Phase 5D — failure atomicity guarantees for consolidated Controlled Writes.
 * Documentation + runtime assertion helpers for offline validation.
 */

export const CONTROLLED_WRITE_ATOMICITY_GUARANTEES = {
  /**
   * Permission / RBAC failure: no repository apply, no domain mutation,
   * optional denial audit only (never false success).
   */
  permissionFailure: "no_mutation_before_rbac_pass",
  /**
   * Scope failure: no repository apply.
   */
  scopeFailure: "no_mutation_before_scope_pass",
  /**
   * Membership / NOT_OPERATIONAL_* : no repository apply.
   */
  membershipFailure: "no_mutation_before_domain_membership_pass",
  /**
   * Precondition / token / expected state failure: no repository apply.
   */
  preconditionFailure: "no_mutation_before_precondition_pass",
  /**
   * Idempotency conflict: no second mutation; first outcome preserved.
   */
  idempotencyConflict: "no_mutation_on_fingerprint_conflict",
  /**
   * Repository failure after AUDIT_INTENT: AUDIT_RESULT denied/failed;
   * Fake repos re-check token under per-target lock — no half-applied state
   * from concurrent losers. Production path unreachable (Disabled).
   */
  repositoryFailure:
    "audit_result_records_failure_productionWriteExecuted_false",
  /**
   * Audit-result failure simulation: domain mutation already committed in Fake
   * only after successful apply; Production remains Disabled so no half-write
   * to Firebase. Operators must treat missing AUDIT_RESULT as investigate-only.
   */
  auditResultFailureSimulation:
    "production_unreachable_fake_apply_is_offline_only",
  /**
   * Critical: validation/RBAC/scope/membership/precondition failures never
   * leave a partially applied domain mutation.
   */
  halfAppliedForbidden: true,
  productionTransactionsImplemented: false,
} as const;

export type AtomicityCheckpoint =
  | "permission"
  | "scope"
  | "membership"
  | "precondition"
  | "idempotency"
  | "repository"
  | "audit_result";

export function mutationAllowedAfterCheckpoint(
  checkpoint: AtomicityCheckpoint,
  passed: boolean,
): boolean {
  if (!passed) return false;
  // Only repository stage (after all prior passes) may mutate.
  return checkpoint === "repository";
}
