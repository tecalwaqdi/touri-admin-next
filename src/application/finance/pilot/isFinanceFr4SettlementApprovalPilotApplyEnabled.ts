/**
 * Finance FR4 Settlement Approval pilot arm gate. Default SKIP. Exact `"1"` only.
 * Never auto-enables FINANCE_WRITE_ENABLED.
 */

import { FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY_ENV } from "@/application/finance/pilot/FinanceFr4PilotConstants";

export function isFinanceFr4SettlementApprovalPilotApplyEnabled(
  value?: string | undefined | null,
): boolean {
  return String(value ?? "").trim() === "1";
}

export function isFinanceFr4SettlementApprovalPilotApplyArmed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isFinanceFr4SettlementApprovalPilotApplyEnabled(
    env[FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY_ENV],
  );
}

export { FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY_ENV };
