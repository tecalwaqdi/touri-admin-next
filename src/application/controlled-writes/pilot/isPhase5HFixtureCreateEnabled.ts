/**
 * Phase 5H — operator-controlled Synthetic Driver fixture harness gates.
 * Default SKIP. Separate from Pilot flags (5E/5F/5G). Never auto-enable.
 */

/** Exact `"1"` only — fixture create dry-run (plan only; writes=0). */
export function isPhase5HCreateSyntheticDriverFixtureDryRunEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

/**
 * Exact `"1"` only — fixture create harness.
 * Phase 5H still refuses Production mutation even when set (preparation).
 */
export function isPhase5HCreateSyntheticDriverFixtureEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}
