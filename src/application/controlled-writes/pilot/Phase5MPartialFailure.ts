/**
 * Phase 5M — partial failure outcomes (§20).
 * Never blind-retry a committed domain write.
 */

export type Phase5MPartialFailureOutcome = {
  readonly code: string;
  readonly domainCommitted: boolean;
  readonly retryDomainWrite: false | "only_if_not_committed";
  readonly operatorAction: string;
};

/**
 * Fail-closed matrix for Pilot apply interruptions.
 * Blind retry of a committed write is always forbidden.
 */
export const PHASE_5M_PARTIAL_FAILURE_OUTCOMES: readonly Phase5MPartialFailureOutcome[] =
  [
    {
      code: "AUDIT_INTENT_FAILED",
      domainCommitted: false,
      retryDomainWrite: "only_if_not_committed",
      operatorAction:
        "Stop. Fix audit path. Safe to retry only after confirming domain still pending_review and idempotency absent.",
    },
    {
      code: "DOMAIN_WRITE_FAILED_AFTER_INTENT",
      domainCommitted: false,
      retryDomainWrite: "only_if_not_committed",
      operatorAction:
        "Audit RESULT should record failure. Confirm registration_status unchanged before any retry.",
    },
    {
      code: "DOMAIN_COMMITTED_AUDIT_RESULT_FAILED",
      domainCommitted: true,
      retryDomainWrite: false,
      operatorAction:
        "Investigate. Do NOT re-apply RequestDriverChanges. Repair audit RESULT only if needed.",
    },
    {
      code: "DOMAIN_COMMITTED_IDEMPOTENCY_PUT_FAILED",
      domainCommitted: true,
      retryDomainWrite: false,
      operatorAction:
        "Investigate. Do NOT re-apply. Manually reconcile idempotency record if safe.",
    },
    {
      code: "DOMAIN_COMMITTED_AUTH_CLAIM_VERIFY_FAILED",
      domainCommitted: true,
      retryDomainWrite: false,
      operatorAction:
        "Domain write stands. Investigate CF syncUserClaimsOnWrite / claims. Do NOT re-apply domain patch.",
    },
    {
      code: "PILOT_ALREADY_APPLIED",
      domainCommitted: true,
      retryDomainWrite: false,
      operatorAction: "Idempotent stop — never apply twice.",
    },
    {
      code: "PILOT_PRECONDITION_FAILED",
      domainCommitted: false,
      retryDomainWrite: false,
      operatorAction: "Before-state changed — abort Pilot; re-qualify fixture.",
    },
    {
      code: "PILOT_DIFF_VIOLATION",
      domainCommitted: false,
      retryDomainWrite: false,
      operatorAction: "Fail-closed — unexpected patch keys; do not write.",
    },
  ] as const;

export function retryAllowedForPartialFailure(code: string): boolean {
  const row = PHASE_5M_PARTIAL_FAILURE_OUTCOMES.find((r) => r.code === code);
  if (!row) return false;
  return row.retryDomainWrite === "only_if_not_committed" && !row.domainCommitted;
}
