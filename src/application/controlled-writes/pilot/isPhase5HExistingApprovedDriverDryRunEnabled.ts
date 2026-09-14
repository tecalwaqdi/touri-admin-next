/**
 * Phase 5H pivot — existing approved synthetic Driver qualification dry-run gate.
 * Default SKIP. Separate from fixture create / Pilot write flags. Never auto-enable.
 */

/** Exact `"1"` only — read-only qualification dry-run (plan only; writes=0). */
export function isPhase5HExistingApprovedDriverDryRunEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}
