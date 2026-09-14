/**
 * Phase 4B — live cross-resource shadow validation gate.
 * Exact "1" only. Default / unset / "true" / "0" → false (SKIP).
 */

export function isPhase4BLiveShadowEnabled(
  raw: string | undefined | null,
): boolean {
  return raw === "1";
}
