/**
 * FR1 registry fixture — check-only IAM + ADC principal preflight.
 * No Auth/Firestore mutation.
 *
 * Principal resolution:
 * - authorized_user → email from ADC access-token introspection (tokeninfo)
 * - service_account → client_email (existing SA principal behavior)
 * - impersonated_service_account → effective impersonated principal (not source user)
 * Fail closed when the effective principal cannot be proven.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import type {
  FinanceFr1AdcCredentialType,
  FinanceFr1AdcPrincipalResolution,
  FinanceFr1AdcPrincipalVerification,
  FinanceFr1RegistryFixtureAdcPrincipalResolver,
  FinanceFr1RegistryFixtureIamPermissionTester,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";

export type { FinanceFr1AdcPrincipalVerification };

export type FinanceFr1RegistryFixtureIamPreflightResult =
  | {
      ok: true;
      status: "IAM_PREFLIGHT_PASS";
      mutationsPerformed: 0;
      projectId: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID;
      adcPrincipal: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL;
      adcCredentialType: FinanceFr1AdcCredentialType;
      resolvedAdcPrincipal: string;
      expectedAdcPrincipal: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL;
      adcPrincipalVerification: "PASS";
      requiredCapabilities: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM;
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
      requiredCapabilities: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM;
      grantedPermissions: readonly string[];
      missingPermissions: readonly string[];
      resolvedPrincipal: string | null;
      adcCredentialType: FinanceFr1AdcCredentialType | null;
      resolvedAdcPrincipal: string | null;
      expectedAdcPrincipal: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL;
      adcPrincipalVerification: FinanceFr1AdcPrincipalVerification;
    };

export type FinanceFr1AdcPrincipalResolveDeps = {
  credentialType: FinanceFr1AdcCredentialType;
  getAccessToken: () => Promise<string | null | undefined>;
  /** Read-only token introspection; must not log/return the token. */
  introspectAccessTokenEmail: (
    accessToken: string,
  ) => Promise<string | null>;
  /** SA JSON / ADC service_account client_email only. */
  getServiceAccountClientEmail: () => Promise<string | null>;
  /** Impersonated target SA email from Impersonated client (not source user). */
  getImpersonatedTargetPrincipal: () => string | null;
};

/**
 * Pure principal resolution — unit-testable; no gcloud / env / ADC filename.
 */
export async function resolveFinanceFr1AdcPrincipalEmail(
  deps: FinanceFr1AdcPrincipalResolveDeps,
): Promise<string | null> {
  switch (deps.credentialType) {
    case "authorized_user": {
      const token = (await deps.getAccessToken())?.trim();
      if (!token) return null;
      const email = (await deps.introspectAccessTokenEmail(token))?.trim();
      return email || null;
    }
    case "service_account": {
      const email = (await deps.getServiceAccountClientEmail())?.trim();
      return email || null;
    }
    case "impersonated_service_account": {
      const token = (await deps.getAccessToken())?.trim();
      if (token) {
        const proven = (await deps.introspectAccessTokenEmail(token))?.trim();
        if (proven) return proven;
      }
      const target = deps.getImpersonatedTargetPrincipal()?.trim();
      return target || null;
    }
    case "unknown":
    default:
      return null;
  }
}

export function classifyFinanceFr1AdcAuthClient(client: object): FinanceFr1AdcCredentialType {
  const name =
    (client as { constructor?: { name?: string } }).constructor?.name ?? "";
  // Prefer constructor name to avoid hard instanceof across dynamic imports in tests.
  if (name === "Impersonated" || name.includes("Impersonated")) {
    return "impersonated_service_account";
  }
  if (name === "UserRefreshClient") {
    return "authorized_user";
  }
  if (name === "JWT" || name === "JWTClient") {
    return "service_account";
  }
  // google-auth-library markers
  if (
    typeof (client as { getTargetPrincipal?: unknown }).getTargetPrincipal ===
    "function"
  ) {
    return "impersonated_service_account";
  }
  if (
    typeof (client as { email?: unknown }).email === "string" &&
    typeof (client as { key?: unknown }).key === "string"
  ) {
    return "service_account";
  }
  if (
    typeof (client as { refreshToken?: unknown }).refreshToken === "string" ||
    typeof (client as { _refreshToken?: unknown })._refreshToken === "string"
  ) {
    return "authorized_user";
  }
  return "unknown";
}

export function principalsMatchExact(
  resolved: string | null | undefined,
  expected: string,
): boolean {
  if (!resolved) return false;
  return resolved.trim().toLowerCase() === expected.trim().toLowerCase();
}

export async function createDefaultFinanceFr1RegistryFixtureIamTester(): Promise<FinanceFr1RegistryFixtureIamPermissionTester> {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform.read-only"],
  });
  return {
    async testIamPermissions(input) {
      const client = await auth.getClient();
      const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(input.projectId)}:testIamPermissions`;
      const res = await client.request<{ permissions?: string[] }>({
        url,
        method: "POST",
        data: { permissions: [...input.permissions] },
      });
      return res.data?.permissions ?? [];
    },
  };
}

/**
 * Resolve ADC effective principal email (ADC only; no SA JSON keys).
 * authorized_user uses access-token introspection — never gcloud core/account,
 * env vars, ADC filename, or hardcoded fallback.
 */
export async function createDefaultFinanceFr1RegistryFixtureAdcPrincipalResolver(): Promise<FinanceFr1RegistryFixtureAdcPrincipalResolver> {
  const { GoogleAuth, Impersonated, UserRefreshClient, JWT } = await import(
    "google-auth-library"
  );
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return {
    async resolvePrincipal(): Promise<FinanceFr1AdcPrincipalResolution> {
      const client = await auth.getClient();

      let credentialType: FinanceFr1AdcCredentialType = "unknown";
      if (client instanceof Impersonated) {
        credentialType = "impersonated_service_account";
      } else if (client instanceof UserRefreshClient) {
        credentialType = "authorized_user";
      } else if (client instanceof JWT) {
        credentialType = "service_account";
      } else {
        credentialType = classifyFinanceFr1AdcAuthClient(client);
      }

      const principalEmail = await resolveFinanceFr1AdcPrincipalEmail({
        credentialType,
        getAccessToken: async () => {
          const res = await client.getAccessToken();
          if (typeof res === "string") return res;
          return res?.token ?? null;
        },
        introspectAccessTokenEmail: async (accessToken) => {
          // OAuth2Client.getTokenInfo — read-only identity lookup on the ADC token.
          if (
            typeof (client as { getTokenInfo?: unknown }).getTokenInfo !==
            "function"
          ) {
            return null;
          }
          try {
            const info = await (
              client as {
                getTokenInfo: (t: string) => Promise<{ email?: string }>;
              }
            ).getTokenInfo(accessToken);
            return info.email?.trim() || null;
          } catch {
            return null;
          }
        },
        getServiceAccountClientEmail: async () => {
          try {
            const creds = await auth.getCredentials();
            return (creds as { client_email?: string }).client_email?.trim() || null;
          } catch {
            return null;
          }
        },
        getImpersonatedTargetPrincipal: () => {
          if (client instanceof Impersonated) {
            try {
              return client.getTargetPrincipal()?.trim() || null;
            } catch {
              return null;
            }
          }
          const fn = (
            client as { getTargetPrincipal?: () => string }
          ).getTargetPrincipal;
          if (typeof fn === "function") {
            try {
              return fn.call(client)?.trim() || null;
            } catch {
              return null;
            }
          }
          return null;
        },
      });

      return { credentialType, principalEmail };
    },
  };
}

export async function runFinanceFr1RegistryFixtureIamPreflight(input?: {
  projectId?: string;
  permissionTester?: FinanceFr1RegistryFixtureIamPermissionTester;
  principalResolver?: FinanceFr1RegistryFixtureAdcPrincipalResolver;
  expectedPrincipal?: string;
}): Promise<FinanceFr1RegistryFixtureIamPreflightResult> {
  const projectId =
    input?.projectId?.trim() || FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID;
  const expectedPrincipal =
    input?.expectedPrincipal ?? FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL;
  const expectedAdcPrincipal = FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return {
      ok: false,
      status: "IAM_PREFLIGHT_FAILED",
      mutationsPerformed: 0,
      code: "SERVICE_ACCOUNT_KEY_REFUSED",
      message:
        "GOOGLE_APPLICATION_CREDENTIALS must be unset — ADC only; no SA keys",
      requiredCapabilities: FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
      grantedPermissions: [],
      missingPermissions: [...FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM],
      resolvedPrincipal: null,
      adcCredentialType: null,
      resolvedAdcPrincipal: null,
      expectedAdcPrincipal,
      adcPrincipalVerification: "FAIL",
    };
  }

  try {
    const creds =
      await new ApplicationDefaultProductionCredentialProvider(
        projectId,
      ).getCredentials();
    if (creds.projectId !== FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID) {
      return {
        ok: false,
        status: "IAM_PREFLIGHT_FAILED",
        mutationsPerformed: 0,
        code: "PROJECT_MISMATCH",
        message: "Credential projectId mismatch",
        requiredCapabilities: FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
        grantedPermissions: [],
        missingPermissions: [...FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM],
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
        requiredCapabilities: FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
        grantedPermissions: [],
        missingPermissions: [...FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM],
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
      projectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
      permissions: FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
    });
    const missing = FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM.filter(
      (p) => !grantedRaw.includes(p),
    );
    const granted = FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM.filter((p) =>
      grantedRaw.includes(p),
    );

    if (missing.length > 0) {
      return {
        ok: false,
        status: "IAM_PREFLIGHT_FAILED",
        mutationsPerformed: 0,
        code: "IAM_PREFLIGHT_FAILED",
        message: `IAM_PREFLIGHT_FAILED missing_count=${missing.length}`,
        requiredCapabilities: FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
        grantedPermissions: granted,
        missingPermissions: missing,
        resolvedPrincipal,
        adcCredentialType,
        resolvedAdcPrincipal: resolvedPrincipal,
        expectedAdcPrincipal,
        // Principal already proven; IAM grant failure is separate.
        adcPrincipalVerification: "PASS",
      };
    }

    return {
      ok: true,
      status: "IAM_PREFLIGHT_PASS",
      mutationsPerformed: 0,
      projectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
      adcPrincipal: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
      adcCredentialType,
      resolvedAdcPrincipal: resolvedPrincipal!,
      expectedAdcPrincipal,
      adcPrincipalVerification: "PASS",
      requiredCapabilities: FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
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
      requiredCapabilities: FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
      grantedPermissions: [],
      missingPermissions: [...FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM],
      resolvedPrincipal: null,
      adcCredentialType: null,
      resolvedAdcPrincipal: null,
      expectedAdcPrincipal,
      adcPrincipalVerification: "FAIL",
    };
  }
}
