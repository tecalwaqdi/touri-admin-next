/**
 * Phase 5M — IAM preflight (check-only).
 * Uses Google Cloud Resource Manager `testIamPermissions` — no IAM mutation,
 * no Driver write, no Auth claim write.
 */

import {
  ApplicationDefaultProductionCredentialProvider,
  type ProductionCredentialProvider,
  type ProductionCredentials,
} from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  PHASE_5M_EXPECTED_PROJECT_ID,
} from "@/application/controlled-writes/pilot/isPhase5MDriverPilotApplyEnabled";
import {
  PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  type Phase5MRequiredOperatorIamPermission,
} from "@/application/controlled-writes/pilot/Phase5MIamDerivation";

export type Phase5MIamPermissionTester = {
  testIamPermissions(input: {
    projectId: string;
    permissions: readonly string[];
  }): Promise<readonly string[]>;
};

export type Phase5MIamPreflightResult =
  | {
      ok: true;
      status: "IAM_PREFLIGHT_PASS";
      mode: "check_only";
      mutationsPerformed: 0;
      iamChanges: 0;
      projectId: typeof PHASE_5M_EXPECTED_PROJECT_ID;
      credentialKind: ProductionCredentials["kind"];
      requiredPermissions: typeof PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS;
      grantedPermissions: readonly Phase5MRequiredOperatorIamPermission[];
      missingPermissions: readonly [];
      driverWriteAttempted: false;
      authClaimWriteAttempted: false;
    }
  | {
      ok: false;
      status: "IAM_PREFLIGHT_FAILED";
      mode: "check_only";
      mutationsPerformed: 0;
      iamChanges: 0;
      code: "IAM_PREFLIGHT_FAILED" | "SERVICE_ACCOUNT_KEY_REFUSED";
      message: string;
      requiredPermissions: typeof PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS;
      grantedPermissions: readonly string[];
      missingPermissions: readonly string[];
      driverWriteAttempted: false;
      authClaimWriteAttempted: false;
    };

export async function createDefaultPhase5MIamPermissionTester(): Promise<Phase5MIamPermissionTester> {
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

function computeMissing(
  granted: readonly string[],
): Phase5MRequiredOperatorIamPermission[] {
  const set = new Set(granted);
  return PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS.filter((p) => !set.has(p));
}

/**
 * Check-only preflight. Resolves ADC (no JSON SA keys), then tests derived
 * permissions. Does not mutate IAM / Drivers / Auth claims.
 */
export async function runPhase5MIamPreflight(input?: {
  projectId?: string;
  credentialProvider?: ProductionCredentialProvider;
  permissionTester?: Phase5MIamPermissionTester;
}): Promise<Phase5MIamPreflightResult> {
  const projectId =
    input?.projectId?.trim() || PHASE_5M_EXPECTED_PROJECT_ID;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return {
      ok: false,
      status: "IAM_PREFLIGHT_FAILED",
      mode: "check_only",
      mutationsPerformed: 0,
      iamChanges: 0,
      code: "SERVICE_ACCOUNT_KEY_REFUSED",
      message:
        "GOOGLE_APPLICATION_CREDENTIALS must be unset — ADC only; no SA keys",
      requiredPermissions: PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS,
      grantedPermissions: [],
      missingPermissions: [...PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS],
      driverWriteAttempted: false,
      authClaimWriteAttempted: false,
    };
  }

  try {
    const provider =
      input?.credentialProvider ??
      new ApplicationDefaultProductionCredentialProvider(projectId);
    const creds = await provider.getCredentials();
    if (creds.projectId !== PHASE_5M_EXPECTED_PROJECT_ID) {
      return {
        ok: false,
        status: "IAM_PREFLIGHT_FAILED",
        mode: "check_only",
        mutationsPerformed: 0,
        iamChanges: 0,
        code: "IAM_PREFLIGHT_FAILED",
        message: "Credential projectId mismatch",
        requiredPermissions: PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS,
        grantedPermissions: [],
        missingPermissions: [...PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS],
        driverWriteAttempted: false,
        authClaimWriteAttempted: false,
      };
    }

    const tester =
      input?.permissionTester ??
      (await createDefaultPhase5MIamPermissionTester());
    const grantedRaw = await tester.testIamPermissions({
      projectId: PHASE_5M_EXPECTED_PROJECT_ID,
      permissions: PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    });
    const missing = computeMissing(grantedRaw);
    const granted = PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS.filter((p) =>
      grantedRaw.includes(p),
    );

    if (missing.length > 0) {
      return {
        ok: false,
        status: "IAM_PREFLIGHT_FAILED",
        mode: "check_only",
        mutationsPerformed: 0,
        iamChanges: 0,
        code: "IAM_PREFLIGHT_FAILED",
        message: `IAM_PREFLIGHT_FAILED missing_count=${missing.length}`,
        requiredPermissions: PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS,
        grantedPermissions: granted,
        missingPermissions: missing,
        driverWriteAttempted: false,
        authClaimWriteAttempted: false,
      };
    }

    return {
      ok: true,
      status: "IAM_PREFLIGHT_PASS",
      mode: "check_only",
      mutationsPerformed: 0,
      iamChanges: 0,
      projectId: PHASE_5M_EXPECTED_PROJECT_ID,
      credentialKind: creds.kind,
      requiredPermissions: PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS,
      grantedPermissions: granted,
      missingPermissions: [],
      driverWriteAttempted: false,
      authClaimWriteAttempted: false,
    };
  } catch (err) {
    return {
      ok: false,
      status: "IAM_PREFLIGHT_FAILED",
      mode: "check_only",
      mutationsPerformed: 0,
      iamChanges: 0,
      code: "IAM_PREFLIGHT_FAILED",
      message:
        err instanceof Error ? err.message : "IAM preflight credential failure",
      requiredPermissions: PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS,
      grantedPermissions: [],
      missingPermissions: [...PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS],
      driverWriteAttempted: false,
      authClaimWriteAttempted: false,
    };
  }
}
