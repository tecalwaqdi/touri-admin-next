/**
 * Phase 5K — operator-controlled read-only provisioned fixture verification gate.
 * Default SKIP. Exact `"1"` only. Never auto-enable. Never enables write flags.
 */

export function isPhase5KVerifyProvisionedDriverFixtureEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

/** Documented write posture for Phase 5K — all false. */
export const PHASE_5K_REQUIRED_WRITE_FLAGS_FALSE = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: false,
} as const;
