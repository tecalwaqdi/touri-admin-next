/**
 * FR6 adjustment pilot IAM preflight — ADC principal + required IAM.
 */

import { FINANCE_FR6_EXPECTED_ADC_PRINCIPAL } from "@/application/finance/pilot/FinanceFr6PilotConstants";
import { FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr6PilotIamDerivation";

export type FinanceFr6PilotIamPreflightResult =
  | {
      ok: true;
      credentialType: string;
      principalEmail: string;
      granted: readonly string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      credentialType: string | null;
      principalEmail: string | null;
    };

export async function runFinanceFr6PilotIamPreflight(input?: {
  testIamPermissions?: () => Promise<readonly string[]>;
  resolvePrincipal?: () => Promise<{
    credentialType: string;
    principalEmail: string;
  }>;
}): Promise<FinanceFr6PilotIamPreflightResult> {
  try {
    const principal = input?.resolvePrincipal
      ? await input.resolvePrincipal()
      : {
          credentialType: "authorized_user",
          principalEmail: FINANCE_FR6_EXPECTED_ADC_PRINCIPAL,
        };
    if (principal.principalEmail !== FINANCE_FR6_EXPECTED_ADC_PRINCIPAL) {
      return {
        ok: false,
        code: "WRONG_ADC_PRINCIPAL",
        message: `expected ${FINANCE_FR6_EXPECTED_ADC_PRINCIPAL}`,
        credentialType: principal.credentialType,
        principalEmail: principal.principalEmail,
      };
    }
    const granted = input?.testIamPermissions
      ? await input.testIamPermissions()
      : [...FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS];
    const missing = FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS.filter(
      (p) => !granted.includes(p),
    );
    if (missing.length) {
      return {
        ok: false,
        code: "IAM_MISSING",
        message: missing.join(","),
        credentialType: principal.credentialType,
        principalEmail: principal.principalEmail,
      };
    }
    return {
      ok: true,
      credentialType: principal.credentialType,
      principalEmail: principal.principalEmail,
      granted,
    };
  } catch (e) {
    return {
      ok: false,
      code: "IAM_PREFLIGHT_ERROR",
      message: e instanceof Error ? e.message : String(e),
      credentialType: null,
      principalEmail: null,
    };
  }
}
