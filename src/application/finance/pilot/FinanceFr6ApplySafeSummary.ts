/**
 * FR6 adjustment pilot apply safe summary (no secrets/PII).
 */

import {
  FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR6_EXPECTED_WRITE_COUNTS,
  FINANCE_FR6_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";

export type FinanceFr6PilotApplyOverallStatus =
  | "PREP_SKIP"
  | "GATE_BLOCKED"
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "CONFLICT_NO_GO"
  | "IAM_DENIED"
  | "RBAC_DENIED"
  | "ACTOR_DENIED";

export type FinanceFr6ApplySafeSummary = {
  overallStatus: FinanceFr6PilotApplyOverallStatus;
  phase: "FR6";
  productionWrites: number;
  expectedWrites: typeof FINANCE_FR6_EXPECTED_WRITE_COUNTS;
  alreadyAppliedWrites: typeof FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS;
  writeCounts: {
    finance_adjustments: number;
    finance_audit_events: number;
    admin_next_cw_idempotency: number;
    financial_settlements: number;
    settlement_payments: number;
    finance_accounting_snapshots: number;
    finance_refund_accounting: number;
    finance_chargeback_accounting: number;
    order: number;
    drivers: number;
    agents: number;
    customers: number;
    totalProductionWrites: number;
  };
  denials: string[];
  blocker: string | null;
  adcCredentialType: string | null;
  adcPrincipalVerification: string | null;
  message: string;
};

export function emptyFinanceFr6ApplySafeSummary(input: {
  overallStatus: FinanceFr6PilotApplyOverallStatus;
  message: string;
  denials?: string[];
  blocker?: string | null;
}): FinanceFr6ApplySafeSummary {
  return {
    overallStatus: input.overallStatus,
    phase: "FR6",
    productionWrites: 0,
    expectedWrites: FINANCE_FR6_EXPECTED_WRITE_COUNTS,
    alreadyAppliedWrites: FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS,
    writeCounts: { ...FINANCE_FR6_ZERO_WRITE_COUNTS },
    denials: input.denials ?? [],
    blocker: input.blocker ?? null,
    adcCredentialType: null,
    adcPrincipalVerification: null,
    message: input.message,
  };
}
