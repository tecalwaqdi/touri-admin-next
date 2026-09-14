/**
 * Finance FR1 pilot arm gate. Default SKIP. Exact `"1"` only.
 * Never auto-enables FINANCE_WRITE_ENABLED.
 */

import { FINANCE_FR1_PILOT_APPLY_ENV } from "@/application/finance/pilot/FinanceFr1PilotConstants";

export function isFinanceFr1PilotApplyEnabled(
  value?: string | undefined | null,
): boolean {
  return String(value ?? "").trim() === "1";
}

export function isFinanceFr1PilotApplyArmed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isFinanceFr1PilotApplyEnabled(env[FINANCE_FR1_PILOT_APPLY_ENV]);
}

export { FINANCE_FR1_PILOT_APPLY_ENV };
