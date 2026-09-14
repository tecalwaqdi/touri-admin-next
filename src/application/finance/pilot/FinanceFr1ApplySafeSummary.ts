/**
 * Safe summary for FR1 Finance Pilot live apply.
 * No PII / secrets / tokens / raw Firebase ID tokens.
 */

import {
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_EXPECTED_WRITE_COUNTS,
  FINANCE_FR1_PILOT_PASS,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import type {
  FinanceFr1AdcCredentialType,
  FinanceFr1AdcPrincipalVerification,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";

export { FINANCE_FR1_PILOT_PASS };

export type FinanceFr1PilotApplyOverallStatus =
  | "SKIPPED"
  | "PENDING_OPERATOR"
  | "REFUSED_PREP"
  | "REFUSED_GATES"
  | "IAM_PREFLIGHT_FAILED"
  | "ALREADY_APPLIED"
  | "CONFLICT_NO_GO"
  | "VERIFICATION_FAILED"
  | typeof FINANCE_FR1_PILOT_PASS;

/** Locked expected snapshot values for approved registry fixture (safe summary). */
export type FinanceFr1CalculatedSnapshotSummary = {
  orderId: string;
  currency: string;
  paymentMethod: string;
  grossFareMinor: string | null;
  eligibleRevenueMinor: string | null;
  commissionRatePercent: number;
  commissionAmountMinor: string | null;
  driverDeductionsMinor: string | null;
  driverNetMinor: string | null;
  historicalReRateForbidden: true;
  mutatesOrderMajors: false;
};

export type FinanceFr1ApplySafeSummary = {
  overallStatus: FinanceFr1PilotApplyOverallStatus;
  harnessArmed: boolean;
  applyAttempted: boolean;
  actorVerified: boolean;
  actorRole: string | null;
  adcCredentialType: FinanceFr1AdcCredentialType | null;
  resolvedAdcPrincipal: string | null;
  expectedAdcPrincipal: typeof FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;
  adcPrincipalVerification: FinanceFr1AdcPrincipalVerification | null;
  registryFixtureVerified: boolean;
  fc01PolicyVersion: string;
  calculatedSnapshot: FinanceFr1CalculatedSnapshotSummary | null;
  exactExpectedWriteCounts: typeof FINANCE_FR1_EXPECTED_WRITE_COUNTS;
  actualSnapshotWrites: number;
  actualAuditIntentWrites: number;
  actualAuditResultWrites: number;
  actualIdempotencyWrites: number;
  totalProductionWrites: number;
  orderWrites: number;
  settlementWrites: number;
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

export function emptyFinanceFr1ApplySafeSummary(input: {
  harnessArmed: boolean;
  overallStatus: FinanceFr1PilotApplyOverallStatus;
  denials?: string[];
  blocker?: string | null;
}): FinanceFr1ApplySafeSummary {
  return {
    overallStatus: input.overallStatus,
    harnessArmed: input.harnessArmed,
    applyAttempted: false,
    actorVerified: false,
    actorRole: null,
    adcCredentialType: null,
    resolvedAdcPrincipal: null,
    expectedAdcPrincipal: FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
    adcPrincipalVerification: null,
    registryFixtureVerified: false,
    fc01PolicyVersion: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version,
    calculatedSnapshot: null,
    exactExpectedWriteCounts: FINANCE_FR1_EXPECTED_WRITE_COUNTS,
    actualSnapshotWrites: 0,
    actualAuditIntentWrites: 0,
    actualAuditResultWrites: 0,
    actualIdempotencyWrites: 0,
    totalProductionWrites: 0,
    orderWrites: 0,
    settlementWrites: 0,
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
