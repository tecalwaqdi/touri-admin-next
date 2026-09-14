/**
 * Safe summary for FR5 Settlement Execution Pilot live apply.
 * No PII / secrets / tokens / raw Firebase ID tokens.
 */

import {
  FINANCE_FR5_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR5_EXPECTED_WRITE_COUNTS,
  FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import type {
  FinanceFr1AdcCredentialType,
  FinanceFr1AdcPrincipalVerification,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";

export { FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS };

export type FinanceFr5PilotApplyOverallStatus =
  | "SKIPPED"
  | "PENDING_OPERATOR"
  | "REFUSED_PREP"
  | "REFUSED_GATES"
  | "IAM_PREFLIGHT_FAILED"
  | "ALREADY_APPLIED"
  | "CONFLICT_NO_GO"
  | "VERIFICATION_FAILED"
  | typeof FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS;

export type FinanceFr5CalculatedExecutionSummary = {
  settlementId: string;
  paymentId: string;
  exactTransition: string;
  exactExecutionDirection: string;
  fromStatus: string;
  toStatus: string;
  paymentStatus: string;
  currency: string;
  direction: string;
  amountMinor: string;
  paidConfirmedMinorAfter: string;
  outstandingMinorAfter: string;
  mutatesFinanceSnapshot: false;
  walletTouched: false;
  payoutExecuted: false;
  sodPass: boolean;
};

export type FinanceFr5ApplySafeSummary = {
  overallStatus: FinanceFr5PilotApplyOverallStatus;
  harnessArmed: boolean;
  applyAttempted: boolean;
  actorVerified: boolean;
  actorRole: string | null;
  adcCredentialType: FinanceFr1AdcCredentialType | null;
  resolvedAdcPrincipal: string | null;
  expectedAdcPrincipal: typeof FINANCE_FR5_EXPECTED_ADC_PRINCIPAL;
  adcPrincipalVerification: FinanceFr1AdcPrincipalVerification | null;
  fr4SettlementVerified: boolean;
  fr3ReconAssumedPass: boolean;
  fc01PolicyVersion: string;
  calculatedExecution: FinanceFr5CalculatedExecutionSummary | null;
  exactExpectedWriteCounts: typeof FINANCE_FR5_EXPECTED_WRITE_COUNTS;
  actualSettlementUpdates: number;
  actualSettlementCreates: number;
  actualPaymentCreates: number;
  actualPaymentUpdates: number;
  actualAuditIntentWrites: number;
  actualAuditResultWrites: number;
  actualIdempotencyWrites: number;
  totalProductionWrites: number;
  snapshotWrites: number;
  orderWrites: number;
  driverWrites: number;
  agentWrites: number;
  customerWrites: number;
  authWrites: number;
  walletWrites: number;
  payoutWrites: number;
  forbiddenWritesZero: boolean;
  verificationPass: boolean | null;
  alreadyApplied: boolean;
  denials: string[];
  blocker: string | null;
};

export function emptyFinanceFr5ApplySafeSummary(input: {
  harnessArmed: boolean;
  overallStatus: FinanceFr5PilotApplyOverallStatus;
  denials?: string[];
  blocker?: string | null;
}): FinanceFr5ApplySafeSummary {
  return {
    overallStatus: input.overallStatus,
    harnessArmed: input.harnessArmed,
    applyAttempted: false,
    actorVerified: false,
    actorRole: null,
    adcCredentialType: null,
    resolvedAdcPrincipal: null,
    expectedAdcPrincipal: FINANCE_FR5_EXPECTED_ADC_PRINCIPAL,
    adcPrincipalVerification: null,
    fr4SettlementVerified: false,
    fr3ReconAssumedPass: true,
    fc01PolicyVersion: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version,
    calculatedExecution: null,
    exactExpectedWriteCounts: FINANCE_FR5_EXPECTED_WRITE_COUNTS,
    actualSettlementUpdates: 0,
    actualSettlementCreates: 0,
    actualPaymentCreates: 0,
    actualPaymentUpdates: 0,
    actualAuditIntentWrites: 0,
    actualAuditResultWrites: 0,
    actualIdempotencyWrites: 0,
    totalProductionWrites: 0,
    snapshotWrites: 0,
    orderWrites: 0,
    driverWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    authWrites: 0,
    walletWrites: 0,
    payoutWrites: 0,
    forbiddenWritesZero: true,
    verificationPass: null,
    alreadyApplied: false,
    denials: input.denials ?? [],
    blocker: input.blocker ?? null,
  };
}
