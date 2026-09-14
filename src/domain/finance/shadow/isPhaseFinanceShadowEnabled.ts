/**
 * Operator gate for live Finance shadow. Default SKIP.
 * PHASE_FINANCE_SHADOW=1 arms read-only Production shadow once.
 */

export const PHASE_FINANCE_SHADOW_EXPECTED_PROJECT_ID =
  "tutorial-multi-language-70gx4j";

export function isPhaseFinanceShadowEnabled(
  raw: string | undefined | null,
): boolean {
  return String(raw ?? "").trim() === "1";
}
