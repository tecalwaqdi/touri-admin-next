/**
 * Finance FR2 Settlement V2 pilot arm gate. Default SKIP. Exact `"1"` only.
 * Never auto-enables FINANCE_WRITE_ENABLED.
 */

import { FINANCE_FR2_SETTLEMENT_PILOT_APPLY_ENV } from "@/application/finance/pilot/FinanceFr2PilotConstants";

export function isFinanceFr2SettlementPilotApplyEnabled(
  value?: string | undefined | null,
): boolean {
  return String(value ?? "").trim() === "1";
}

export function isFinanceFr2SettlementPilotApplyArmed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isFinanceFr2SettlementPilotApplyEnabled(
    env[FINANCE_FR2_SETTLEMENT_PILOT_APPLY_ENV],
  );
}

export { FINANCE_FR2_SETTLEMENT_PILOT_APPLY_ENV };
