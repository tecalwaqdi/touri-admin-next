/**
 * Phase 5E — pure helpers for operator-controlled Driver Pilot gates.
 * Default SKIP. Never auto-enable in CI / agents.
 */

/** Exact `"1"` only. undefined / "" / "0" / other → false. */
export function isPhase5EDriverPilotEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

/** Exact `"1"` only — dry-run (read/validate/plan, writes=0). */
export function isPhase5EDriverPilotDryRunEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}
