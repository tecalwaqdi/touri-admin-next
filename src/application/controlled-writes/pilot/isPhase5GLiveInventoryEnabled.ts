/**
 * Phase 5G — operator-controlled live synthetic Driver inventory env gate.
 * Default SKIP. Exact `"1"` only. Never auto-enable in CI / agents.
 */

export function isPhase5GLiveSyntheticDriverInventoryEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}
