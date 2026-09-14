/**
 * Phase 5L — assert all write-enabling flags remain false (incl. Auth fixture write).
 */

import {
  PHASE_5L_REQUIRED_WRITE_FLAGS_FALSE,
  type Phase5LWriteFlagSnapshot,
} from "@/application/controlled-writes/pilot/isPhase5LDriverPilotDryRunEnabled";

export function assertPhase5LWriteFlagsFalse(
  flags: Phase5LWriteFlagSnapshot = PHASE_5L_REQUIRED_WRITE_FLAGS_FALSE,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === false &&
    flags.PRODUCTION_WRITE_ENABLED === false &&
    flags.DRIVER_WRITE_ENABLED === false &&
    flags.AGENT_WRITE_ENABLED === false &&
    flags.CUSTOMER_WRITE_ENABLED === false &&
    flags.CUSTOMER_AUTH_WRITE_ENABLED === false &&
    flags.FINANCE_WRITE_ENABLED === false &&
    flags.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED === false
  );
}

export function assertPhase5LProcessEnvWriteFlagsFalse(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const truthy = (v: string | undefined) => v === "true" || v === "1";
  return !(
    truthy(env.GLOBAL_PRODUCTION_WRITE_ENABLED) ||
    truthy(env.PRODUCTION_WRITE_ENABLED) ||
    truthy(env.DRIVER_WRITE_ENABLED) ||
    truthy(env.AGENT_WRITE_ENABLED) ||
    truthy(env.CUSTOMER_WRITE_ENABLED) ||
    truthy(env.CUSTOMER_AUTH_WRITE_ENABLED) ||
    truthy(env.FINANCE_WRITE_ENABLED) ||
    truthy(env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED)
  );
}
