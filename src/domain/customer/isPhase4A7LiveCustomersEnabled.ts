/**
 * Phase 4A-7 — pure helper for operator-controlled Customers live gate.
 * Intentional PHASE4A7_LIVE_CUSTOMERS=1 must not fail always-on regressions.
 */

/**
 * Returns true only when the env value is exactly `"1"`.
 * undefined / "" / "0" / any other string → false.
 */
export function isPhase4A7LiveCustomersEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}
