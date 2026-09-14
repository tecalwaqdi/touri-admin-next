/**
 * Finance FR5 Settlement Execution pilot arm gate. Default SKIP. Exact `"1"` only.
 * Never auto-enables FINANCE_WRITE_ENABLED.
 */

import { FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY_ENV } from "@/application/finance/pilot/FinanceFr5PilotConstants";

export function isFinanceFr5SettlementExecutionPilotApplyEnabled(
  value?: string | undefined | null,
): boolean {
  return String(value ?? "").trim() === "1";
}

export function isFinanceFr5SettlementExecutionPilotApplyArmed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isFinanceFr5SettlementExecutionPilotApplyEnabled(
    env[FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY_ENV],
  );
}

export { FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY_ENV };
