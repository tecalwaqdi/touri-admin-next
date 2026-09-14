/**
 * Phase 5N — metadata reconciliation dry-run gate.
 * Default SKIP. Exact `"1"` only. Never auto-enable.
 * Dry-run may read Production; must not write.
 */

export function isPhase5NMetadataReconcileDryRunEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

/**
 * Apply gate — exact `"1"` only. Never auto-enable.
 * Live Production writes only when operator arms this flag + write gates.
 */
export function isPhase5NMetadataReconcileApplyEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

export const PHASE_5N_EXPECTED_PROJECT_ID =
  "tutorial-multi-language-70gx4j" as const;
