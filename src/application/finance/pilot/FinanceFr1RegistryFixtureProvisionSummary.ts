/**
 * Safe summary for FR1 registry fixture provision harness.
 * No PII / secrets / tokens.
 */

import {
  FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import type {
  FinanceFr1AdcCredentialType,
  FinanceFr1AdcPrincipalVerification,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";

export type FinanceFr1RegistryFixtureProvisionOverallStatus =
  | "SKIPPED"
  | "REFUSED_PREP"
  | "REFUSED_GATES"
  | "IAM_PREFLIGHT_FAILED"
  | "FIXTURE_ALREADY_EXISTS"
  | "CONFLICT_NO_GO"
  | "VERIFICATION_FAILED"
  | typeof FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS;

export type FinanceFr1RegistryFixtureProvisionSafeSummary = {
  overallStatus: FinanceFr1RegistryFixtureProvisionOverallStatus;
  harnessArmed: boolean;
  actualCreate: boolean;
  fixtureCreated: boolean;
  idempotencyCreated: boolean;
  fixtureAlreadyExists: boolean;
  registryDocumentId: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID;
  idempotencyKey: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY;
  exactExpectedWriteCounts: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE;
  actualRegistryWrites: number;
  actualIdempotencyWrites: number;
  totalProductionWrites: number;
  forbiddenWritesZero: boolean;
  verificationPass: boolean | null;
  adcCredentialType: FinanceFr1AdcCredentialType | null;
  resolvedAdcPrincipal: string | null;
  expectedAdcPrincipal: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL;
  adcPrincipalVerification: FinanceFr1AdcPrincipalVerification | null;
  denials: string[];
  blocker: string | null;
};

export function emptyFinanceFr1RegistryFixtureProvisionSafeSummary(input: {
  harnessArmed: boolean;
  overallStatus: FinanceFr1RegistryFixtureProvisionOverallStatus;
  denials?: string[];
  blocker?: string | null;
}): FinanceFr1RegistryFixtureProvisionSafeSummary {
  return {
    overallStatus: input.overallStatus,
    harnessArmed: input.harnessArmed,
    actualCreate: false,
    fixtureCreated: false,
    idempotencyCreated: false,
    fixtureAlreadyExists: false,
    registryDocumentId: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
    idempotencyKey: FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
    exactExpectedWriteCounts:
      FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
    actualRegistryWrites: 0,
    actualIdempotencyWrites: 0,
    totalProductionWrites: 0,
    forbiddenWritesZero: true,
    verificationPass: null,
    adcCredentialType: null,
    resolvedAdcPrincipal: null,
    expectedAdcPrincipal: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
    adcPrincipalVerification: null,
    denials: input.denials ?? [],
    blocker: input.blocker ?? null,
  };
}

export function applyFinanceFr1AdcPrincipalSafeSummaryFields(
  summary: FinanceFr1RegistryFixtureProvisionSafeSummary,
  iam: {
    adcCredentialType: FinanceFr1AdcCredentialType | null;
    resolvedAdcPrincipal: string | null;
    expectedAdcPrincipal: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL;
    adcPrincipalVerification: FinanceFr1AdcPrincipalVerification;
  },
): void {
  summary.adcCredentialType = iam.adcCredentialType;
  summary.resolvedAdcPrincipal = iam.resolvedAdcPrincipal;
  summary.expectedAdcPrincipal = iam.expectedAdcPrincipal;
  summary.adcPrincipalVerification = iam.adcPrincipalVerification;
}
