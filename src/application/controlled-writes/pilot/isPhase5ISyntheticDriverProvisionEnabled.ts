/**
 * Phase 5I — operator-controlled Auth-safe synthetic Driver provisioning gates.
 * Default SKIP / write disabled. Separate from Pilot flags (5E–5H).
 * Exact `"1"` only. Never auto-enable. Global write gates stay documented false.
 */

/** Exact `"1"` — offline / operator dry-run harness (plan only; writes = 0). */
export function isPhase5ISyntheticDriverProvisionDryRunEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

/**
 * Exact `"1"` — provision harness arm.
 * Phase 5I still refuses live Auth/Firestore mutation while write gates are off.
 */
export function isPhase5IProvisionSyntheticDriverEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

/**
 * Auth fixture write capability.
 * Accepts `"true"` (Phase 5J preferred) or `"1"`. Default false / unset.
 */
export function isSyntheticAuthFixtureWriteEnabled(
  value?: string | undefined,
): boolean {
  return value === "true" || value === "1";
}

/** Documented global write gates — NOT activated in Phase 5I. */
export const PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: false,
} as const;
