/**
 * Safe summary for FR2 Settlement V2 Pilot live apply.
 * No PII / secrets / tokens / raw Firebase ID tokens.
 */

import {
  FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR2_EXPECTED_WRITE_COUNTS,
  FINANCE_FR2_SETTLEMENT_PILOT_PASS,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import type {
  FinanceFr1AdcCredentialType,
  FinanceFr1AdcPrincipalVerification,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";

export { FINANCE_FR2_SETTLEMENT_PILOT_PASS };

export type FinanceFr2PilotApplyOverallStatus =
  | "SKIPPED"
  | "PENDING_OPERATOR"
  | "REFUSED_PREP"
  | "REFUSED_GATES"
  | "IAM_PREFLIGHT_FAILED"
  | "ALREADY_APPLIED"
  | "CONFLICT_NO_GO"
  | "VERIFICATION_FAILED"
  | typeof FINANCE_FR2_SETTLEMENT_PILOT_PASS;

export type FinanceFr2CalculatedSettlementSummary = {
  settlementId: string;
  sourceAccountingSnapshotId: string;
  currency: string;
  paymentMethod: string;
  direction: string;
  status: string;
  amountMinor: string;
  claimAmountMinor: string;
  fr1GrossFareMinor: string;
  fr1CommissionMinor: string;
  fr1DriverNetMinor: string;
  agentSettlementCreated: false;
  mutatesFinanceSnapshot: false;
  paymentExecutionForbidden: true;
};

export type FinanceFr2ApplySafeSummary = {
  overallStatus: FinanceFr2PilotApplyOverallStatus;
  harnessArmed: boolean;
  applyAttempted: boolean;
  actorVerified: boolean;
  actorRole: string | null;
  adcCredentialType: FinanceFr1AdcCredentialType | null;
  resolvedAdcPrincipal: string | null;
  expectedAdcPrincipal: typeof FINANCE_FR2_EXPECTED_ADC_PRINCIPAL;
  adcPrincipalVerification: FinanceFr1AdcPrincipalVerification | null;
  fr1SnapshotVerified: boolean;
  fc01PolicyVersion: string;
  calculatedSettlement: FinanceFr2CalculatedSettlementSummary | null;
  exactExpectedWriteCounts: typeof FINANCE_FR2_EXPECTED_WRITE_COUNTS;
  actualSettlementWrites: number;
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

export function emptyFinanceFr2ApplySafeSummary(input: {
  harnessArmed: boolean;
  overallStatus: FinanceFr2PilotApplyOverallStatus;
  denials?: string[];
  blocker?: string | null;
}): FinanceFr2ApplySafeSummary {
  return {
    overallStatus: input.overallStatus,
    harnessArmed: input.harnessArmed,
    applyAttempted: false,
    actorVerified: false,
    actorRole: null,
    adcCredentialType: null,
    resolvedAdcPrincipal: null,
    expectedAdcPrincipal: FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
    adcPrincipalVerification: null,
    fr1SnapshotVerified: false,
    fc01PolicyVersion: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version,
    calculatedSettlement: null,
    exactExpectedWriteCounts: FINANCE_FR2_EXPECTED_WRITE_COUNTS,
    actualSettlementWrites: 0,
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
