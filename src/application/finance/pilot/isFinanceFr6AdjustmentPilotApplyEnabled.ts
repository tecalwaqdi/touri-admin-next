/**
 * Finance FR6 adjustment pilot arm gate. Default SKIP. Exact `"1"` only.
 */

import { FINANCE_FR6_ADJUSTMENT_PILOT_APPLY_ENV } from "@/application/finance/pilot/FinanceFr6PilotConstants";

export function isFinanceFr6AdjustmentPilotApplyEnabled(
  value?: string | undefined | null,
): boolean {
  return String(value ?? "").trim() === "1";
}

export function isFinanceFr6AdjustmentPilotApplyArmed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isFinanceFr6AdjustmentPilotApplyEnabled(
    env[FINANCE_FR6_ADJUSTMENT_PILOT_APPLY_ENV],
  );
}

export { FINANCE_FR6_ADJUSTMENT_PILOT_APPLY_ENV };
