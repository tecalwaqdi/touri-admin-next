/**
 * Phase 4A-5 — pure helper for operator-controlled Drivers live gate.
 * Intentional PHASE4A5_LIVE_DRIVERS=1 must not fail always-on regressions.
 */

/**
 * Returns true only when the env value is exactly `"1"`.
 * undefined / "" / "0" / any other string → false.
 */
export function isPhase4A5LiveDriversEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}
