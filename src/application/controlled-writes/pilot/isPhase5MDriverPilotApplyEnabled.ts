/**
 * Phase 5M — operator-controlled Driver Pilot apply gate.
 * Default SKIP. Exact `"1"` only. Never auto-enable.
 * Write flags are separate (GLOBAL/PRODUCTION/DRIVER) and restored only by the
 * Phase 5M live harness when armed — never by global Vitest sanitization.
 */

export function isPhase5MDriverPilotApplyEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

export const PHASE_5M_EXPECTED_PROJECT_ID =
  "tutorial-multi-language-70gx4j" as const;

/** Reuses Phase 5L planned key — one Pilot apply identity. */
export const PHASE_5M_PILOT_IDEMPOTENCY_KEY =
  "phase5l_driver_needs_changes_pilot_v1" as const;
