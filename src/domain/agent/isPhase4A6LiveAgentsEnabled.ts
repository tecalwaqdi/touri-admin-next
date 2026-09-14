/**
 * Phase 4A-6 — pure helper for operator-controlled Agents live gate.
 * Intentional PHASE4A6_LIVE_AGENTS=1 must not fail always-on regressions.
 */

/**
 * Returns true only when the env value is exactly `"1"`.
 * undefined / "" / "0" / any other string → false.
 */
export function isPhase4A6LiveAgentsEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}
