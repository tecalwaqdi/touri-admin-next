/**
 * Safe summary for FR4 Settlement Approval Pilot live apply.
 * No PII / secrets / tokens / raw Firebase ID tokens.
 */

import {
  FINANCE_FR4_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR4_EXPECTED_WRITE_COUNTS,
  FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";
import type {
  FinanceFr1AdcCredentialType,
  FinanceFr1AdcPrincipalVerification,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";

export { FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS };

export type FinanceFr4PilotApplyOverallStatus =
  | "SKIPPED"
  | "PENDING_OPERATOR"
  | "REFUSED_PREP"
  | "REFUSED_GATES"
  | "IAM_PREFLIGHT_FAILED"
  | "ALREADY_APPLIED"
  | "CONFLICT_NO_GO"
  | "VERIFICATION_FAILED"
  | typeof FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS;

export type FinanceFr4CalculatedApprovalSummary = {
  settlementId: string;
  exactTransition: string;
  fromStatus: string;
  toStatus: string;
  opsApprovalLabel: string;
  currency: string;
  direction: string;
  amountMinor: string;
  paidConfirmedMinor: string;
  outstandingMinor: string;
  sourceAccountingSnapshotId: string;
  mutatesFinanceSnapshot: false;
  mutatesSettlementAmounts: false;
  paymentExecutionForbidden: true;
  dualControlPass: boolean;
};

export type FinanceFr4ApplySafeSummary = {
  overallStatus: FinanceFr4PilotApplyOverallStatus;
  harnessArmed: boolean;
  applyAttempted: boolean;
  actorVerified: boolean;
  actorRole: string | null;
  adcCredentialType: FinanceFr1AdcCredentialType | null;
  resolvedAdcPrincipal: string | null;
  expectedAdcPrincipal: typeof FINANCE_FR4_EXPECTED_ADC_PRINCIPAL;
  adcPrincipalVerification: FinanceFr1AdcPrincipalVerification | null;
  fr2SettlementVerified: boolean;
  fr3ReconAssumedPass: boolean;
  fc01PolicyVersion: string;
  calculatedApproval: FinanceFr4CalculatedApprovalSummary | null;
  exactExpectedWriteCounts: typeof FINANCE_FR4_EXPECTED_WRITE_COUNTS;
  actualSettlementUpdates: number;
  actualSettlementCreates: number;
  actualAuditIntentWrites: number;
  actualAuditResultWrites: number;
  actualIdempotencyWrites: number;
  totalProductionWrites: number;
  snapshotWrites: number;
  orderWrites: number;
  paymentWrites: number;
  driverWrites: number;
  agentWrites: number;
  customerWrites: number;
  authWrites: number;
  forbiddenWritesZero: boolean;
  verificationPass: boolean | null;
  alreadyApplied: boolean;
  denials: string[];
  blocker: string | null;
};

export function emptyFinanceFr4ApplySafeSummary(input: {
  harnessArmed: boolean;
  overallStatus: FinanceFr4PilotApplyOverallStatus;
  denials?: string[];
  blocker?: string | null;
}): FinanceFr4ApplySafeSummary {
  return {
    overallStatus: input.overallStatus,
    harnessArmed: input.harnessArmed,
    applyAttempted: false,
    actorVerified: false,
    actorRole: null,
    adcCredentialType: null,
    resolvedAdcPrincipal: null,
    expectedAdcPrincipal: FINANCE_FR4_EXPECTED_ADC_PRINCIPAL,
    adcPrincipalVerification: null,
    fr2SettlementVerified: false,
    fr3ReconAssumedPass: true,
    fc01PolicyVersion: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version,
    calculatedApproval: null,
    exactExpectedWriteCounts: FINANCE_FR4_EXPECTED_WRITE_COUNTS,
    actualSettlementUpdates: 0,
    actualSettlementCreates: 0,
    actualAuditIntentWrites: 0,
    actualAuditResultWrites: 0,
    actualIdempotencyWrites: 0,
    totalProductionWrites: 0,
    snapshotWrites: 0,
    orderWrites: 0,
    paymentWrites: 0,
    driverWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    authWrites: 0,
    forbiddenWritesZero: true,
    verificationPass: null,
    alreadyApplied: false,
    denials: input.denials ?? [],
    blocker: input.blocker ?? null,
  };
}
