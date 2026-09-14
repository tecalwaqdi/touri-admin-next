/**
 * FR1 registry-backed Finance input arm gate.
 * Default SKIP. Exact `"1"` only.
 * Required to consume admin_next_finance_fr1_order_fixtures as Finance input.
 * Never auto-enables FINANCE_WRITE_ENABLED.
 */

import { FINANCE_FR1_REGISTRY_PILOT_ENV } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";

export function isFinanceFr1RegistryPilotEnabled(
  value?: string | undefined | null,
): boolean {
  return String(value ?? "").trim() === "1";
}

export function isFinanceFr1RegistryPilotArmed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isFinanceFr1RegistryPilotEnabled(env[FINANCE_FR1_REGISTRY_PILOT_ENV]);
}

export { FINANCE_FR1_REGISTRY_PILOT_ENV };
