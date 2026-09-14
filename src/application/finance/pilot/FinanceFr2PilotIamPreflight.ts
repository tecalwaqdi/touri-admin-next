/**
 * FR2 Settlement V2 pilot — check-only IAM + ADC principal preflight.
 * Reuses FR1 authorized_user tokeninfo principal resolver pattern.
 * Exact permissions for the 4-write path. No Auth/Firestore mutation.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR2_EXPECTED_PROJECT_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr2PilotIamDerivation";
import {
  createDefaultFinanceFr1RegistryFixtureAdcPrincipalResolver,
  createDefaultFinanceFr1RegistryFixtureIamTester,
  principalsMatchExact,
} from "@/application/finance/pilot/FinanceFr1RegistryFixtureIamPreflight";
import type {
  FinanceFr1AdcCredentialType,
  FinanceFr1AdcPrincipalVerification,
  FinanceFr1RegistryFixtureAdcPrincipalResolver,
  FinanceFr1RegistryFixtureIamPermissionTester,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";

export type FinanceFr2PilotIamPreflightResult =
  | {
      ok: true;
      status: "IAM_PREFLIGHT_PASS";
      mutationsPerformed: 0;
      projectId: typeof FINANCE_FR2_EXPECTED_PROJECT_ID;
      adcCredentialType: FinanceFr1AdcCredentialType;
      resolvedAdcPrincipal: string;
      expectedAdcPrincipal: typeof FINANCE_FR2_EXPECTED_ADC_PRINCIPAL;
      adcPrincipalVerification: "PASS";
      requiredCapabilities: typeof FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS;
      grantedPermissions: readonly string[];
      missingPermissions: readonly [];
    }
  | {
      ok: false;
      status: "IAM_PREFLIGHT_FAILED";
      mutationsPerformed: 0;
      code:
        | "SERVICE_ACCOUNT_KEY_REFUSED"
        | "ADC_PRINCIPAL_MISMATCH"
        | "IAM_PREFLIGHT_FAILED"
        | "PROJECT_MISMATCH";
      message: string;
      requiredCapabilities: typeof FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS;
      grantedPermissions: readonly string[];
      missingPermissions: readonly string[];
      resolvedPrincipal: string | null;
      adcCredentialType: FinanceFr1AdcCredentialType | null;
      resolvedAdcPrincipal: string | null;
      expectedAdcPrincipal: typeof FINANCE_FR2_EXPECTED_ADC_PRINCIPAL;
      adcPrincipalVerification: FinanceFr1AdcPrincipalVerification;
    };

export async function runFinanceFr2PilotIamPreflight(input?: {
  projectId?: string;
  permissionTester?: FinanceFr1RegistryFixtureIamPermissionTester;
  principalResolver?: FinanceFr1RegistryFixtureAdcPrincipalResolver;
  expectedPrincipal?: string;
}): Promise<FinanceFr2PilotIamPreflightResult> {
  const projectId = input?.projectId?.trim() || FINANCE_FR2_EXPECTED_PROJECT_ID;
  const expectedPrincipal =
    input?.expectedPrincipal ?? FINANCE_FR2_EXPECTED_ADC_PRINCIPAL;
  const expectedAdcPrincipal = FINANCE_FR2_EXPECTED_ADC_PRINCIPAL;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return {
      ok: false,
      status: "IAM_PREFLIGHT_FAILED",
      mutationsPerformed: 0,
      code: "SERVICE_ACCOUNT_KEY_REFUSED",
      message:
        "GOOGLE_APPLICATION_CREDENTIALS must be unset — ADC only; no SA keys",
      requiredCapabilities: FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
      grantedPermissions: [],
      missingPermissions: [...FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS],
      resolvedPrincipal: null,
      adcCredentialType: null,
      resolvedAdcPrincipal: null,
      expectedAdcPrincipal,
      adcPrincipalVerification: "FAIL",
    };
  }

  try {
    const offlineInjected =
      input?.principalResolver != null && input?.permissionTester != null;

    if (!offlineInjected) {
      const creds =
        await new ApplicationDefaultProductionCredentialProvider(
          projectId,
        ).getCredentials();
      if (creds.projectId !== FINANCE_FR2_EXPECTED_PROJECT_ID) {
        return {
          ok: false,
          status: "IAM_PREFLIGHT_FAILED",
          mutationsPerformed: 0,
          code: "PROJECT_MISMATCH",
          message: "Credential projectId mismatch",
          requiredCapabilities: FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
          grantedPermissions: [],
          missingPermissions: [...FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS],
          resolvedPrincipal: null,
          adcCredentialType: null,
          resolvedAdcPrincipal: null,
          expectedAdcPrincipal,
          adcPrincipalVerification: "FAIL",
        };
      }
    } else if (projectId !== FINANCE_FR2_EXPECTED_PROJECT_ID) {
      return {
        ok: false,
        status: "IAM_PREFLIGHT_FAILED",
        mutationsPerformed: 0,
        code: "PROJECT_MISMATCH",
        message: "Credential projectId mismatch",
        requiredCapabilities: FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
        grantedPermissions: [],
        missingPermissions: [...FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS],
        resolvedPrincipal: null,
        adcCredentialType: null,
        resolvedAdcPrincipal: null,
        expectedAdcPrincipal,
        adcPrincipalVerification: "FAIL",
      };
    }

    const resolver =
      input?.principalResolver ??
      (await createDefaultFinanceFr1RegistryFixtureAdcPrincipalResolver());
    const resolution = await resolver.resolvePrincipal();
    const resolvedPrincipal = resolution.principalEmail;
    const adcCredentialType = resolution.credentialType;

    if (!principalsMatchExact(resolvedPrincipal, expectedPrincipal)) {
      return {
        ok: false,
        status: "IAM_PREFLIGHT_FAILED",
        mutationsPerformed: 0,
        code: "ADC_PRINCIPAL_MISMATCH",
        message: `ADC principal mismatch: expected ${expectedPrincipal}`,
        requiredCapabilities: FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
        grantedPermissions: [],
        missingPermissions: [...FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS],
        resolvedPrincipal,
        adcCredentialType,
        resolvedAdcPrincipal: resolvedPrincipal,
        expectedAdcPrincipal,
        adcPrincipalVerification: "FAIL",
      };
    }

    const tester =
      input?.permissionTester ??
      (await createDefaultFinanceFr1RegistryFixtureIamTester());
    const grantedRaw = await tester.testIamPermissions({
      projectId: FINANCE_FR2_EXPECTED_PROJECT_ID,
      permissions: FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    });
    const missing = FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS.filter(
      (p) => !grantedRaw.includes(p),
    );
    const granted = FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS.filter((p) =>
      grantedRaw.includes(p),
    );

    if (missing.length > 0) {
      return {
        ok: false,
        status: "IAM_PREFLIGHT_FAILED",
        mutationsPerformed: 0,
        code: "IAM_PREFLIGHT_FAILED",
        message: `IAM_PREFLIGHT_FAILED missing_count=${missing.length}`,
        requiredCapabilities: FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
        grantedPermissions: granted,
        missingPermissions: missing,
        resolvedPrincipal,
        adcCredentialType,
        resolvedAdcPrincipal: resolvedPrincipal,
        expectedAdcPrincipal,
        adcPrincipalVerification: "PASS",
      };
    }

    return {
      ok: true,
      status: "IAM_PREFLIGHT_PASS",
      mutationsPerformed: 0,
      projectId: FINANCE_FR2_EXPECTED_PROJECT_ID,
      adcCredentialType,
      resolvedAdcPrincipal: resolvedPrincipal!,
      expectedAdcPrincipal,
      adcPrincipalVerification: "PASS",
      requiredCapabilities: FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
      grantedPermissions: granted,
      missingPermissions: [],
    };
  } catch (err) {
    return {
      ok: false,
      status: "IAM_PREFLIGHT_FAILED",
      mutationsPerformed: 0,
      code: "IAM_PREFLIGHT_FAILED",
      message:
        err instanceof Error ? err.message : "IAM preflight credential failure",
      requiredCapabilities: FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
      grantedPermissions: [],
      missingPermissions: [...FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS],
      resolvedPrincipal: null,
      adcCredentialType: null,
      resolvedAdcPrincipal: null,
      expectedAdcPrincipal,
      adcPrincipalVerification: "FAIL",
    };
  }
}
