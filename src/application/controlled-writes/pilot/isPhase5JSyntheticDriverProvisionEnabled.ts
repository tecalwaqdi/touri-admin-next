/**
 * Phase 5J — operator harness + write-enabling gates for Auth-safe synthetic Driver.
 * Default SKIP / write disabled. Exact `"1"` for provision harness arms.
 * Write flags accept `"true"` (preferred) or `"1"`.
 * Never auto-enable. Do NOT preserve write-enabling flags through Vitest sanitization.
 */

import { PHASE_5I_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";

/** Exact `"1"` — live provision harness arm (still requires all safety gates). */
export function isPhase5JProvisionSyntheticDriverEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

/** Exact `"1"` — Phase 5I provision service arm (required for real provision). */
export function isPhase5IProvisionArmExactOne(
  value?: string | undefined,
): boolean {
  return value === "1";
}

/** `"true"` preferred; `"1"` accepted for operator ergonomics. */
export function isEnvWriteFlagTrue(value?: string | undefined): boolean {
  return value === "true" || value === "1";
}

export const PHASE_5J_EXPECTED_PROJECT_ID = PHASE_5I_EXPECTED_PROJECT_ID;

/** Documented defaults — NOT activated in this implementation session. */
export const PHASE_5J_WRITE_GATES_DOCUMENTED_DEFAULT = {
  PHASE5I_PROVISION_SYNTHETIC_DRIVER: false,
  PHASE5J_PROVISION_SYNTHETIC_DRIVER: false,
  SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: false,
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  EXPECTED_PROJECT_ID: PHASE_5J_EXPECTED_PROJECT_ID,
} as const;
