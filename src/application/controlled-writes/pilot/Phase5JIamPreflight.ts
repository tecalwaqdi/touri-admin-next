/**
 * Phase 5J — IAM preflight (check-only).
 * Uses Google Cloud Resource Manager `testIamPermissions` — no IAM mutation,
 * no Auth create, no Firestore create.
 */

import {
  ApplicationDefaultProductionCredentialProvider,
  type ProductionCredentialProvider,
  type ProductionCredentials,
} from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { PHASE_5J_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/isPhase5JSyntheticDriverProvisionEnabled";

/** Required IAM capabilities — ALL four must be granted for PASS. */
export const PHASE_5J_REQUIRED_IAM_CAPABILITIES = [
  "firebaseauth.users.create",
  "firebaseauth.users.get",
  "datastore.entities.create",
  "datastore.entities.get",
] as const;

export type Phase5JRequiredIamPermission =
  (typeof PHASE_5J_REQUIRED_IAM_CAPABILITIES)[number];

export type Phase5JIamPermissionTester = {
  testIamPermissions(input: {
    projectId: string;
    permissions: readonly string[];
  }): Promise<readonly string[]>;
};

export type Phase5JIamPreflightResult =
  | {
      ok: true;
      status: "IAM_PREFLIGHT_PASS";
      mode: "check_only";
      mutationsPerformed: 0;
      iamChanges: 0;
      projectId: typeof PHASE_5J_EXPECTED_PROJECT_ID;
      credentialKind: ProductionCredentials["kind"];
      requiredCapabilities: typeof PHASE_5J_REQUIRED_IAM_CAPABILITIES;
      grantedPermissions: readonly Phase5JRequiredIamPermission[];
      missingPermissions: readonly [];
      authCreateAttempted: false;
      firestoreCreateAttempted: false;
    }
  | {
      ok: false;
      status: "IAM_PREFLIGHT_FAILED";
      mode: "check_only";
      mutationsPerformed: 0;
      iamChanges: 0;
      code: "IAM_PREFLIGHT_FAILED" | "SERVICE_ACCOUNT_KEY_REFUSED";
      message: string;
      requiredCapabilities: typeof PHASE_5J_REQUIRED_IAM_CAPABILITIES;
      grantedPermissions: readonly string[];
      missingPermissions: readonly string[];
      authCreateAttempted: false;
      firestoreCreateAttempted: false;
    };

/**
 * Default check-only tester: ADC access token → CRM projects.testIamPermissions.
 * Never mutates IAM bindings.
 */
export async function createDefaultPhase5JIamPermissionTester(): Promise<Phase5JIamPermissionTester> {
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
): Phase5JRequiredIamPermission[] {
  const set = new Set(granted);
  return PHASE_5J_REQUIRED_IAM_CAPABILITIES.filter((p) => !set.has(p));
}

/**
 * Check-only preflight. Resolves ADC (no JSON SA keys), then tests the four
 * required permissions. Does not call createUser or Firestore create.
 * Does not change IAM bindings.
 */
export async function runPhase5JIamPreflight(input?: {
  projectId?: string;
  credentialProvider?: ProductionCredentialProvider;
  permissionTester?: Phase5JIamPermissionTester;
}): Promise<Phase5JIamPreflightResult> {
  const projectId =
    input?.projectId?.trim() || PHASE_5J_EXPECTED_PROJECT_ID;

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
      requiredCapabilities: PHASE_5J_REQUIRED_IAM_CAPABILITIES,
      grantedPermissions: [],
      missingPermissions: [...PHASE_5J_REQUIRED_IAM_CAPABILITIES],
      authCreateAttempted: false,
      firestoreCreateAttempted: false,
    };
  }

  try {
    const provider =
      input?.credentialProvider ??
      new ApplicationDefaultProductionCredentialProvider(projectId);
    const creds = await provider.getCredentials();
    if (creds.projectId !== PHASE_5J_EXPECTED_PROJECT_ID) {
      return {
        ok: false,
        status: "IAM_PREFLIGHT_FAILED",
        mode: "check_only",
        mutationsPerformed: 0,
        iamChanges: 0,
        code: "IAM_PREFLIGHT_FAILED",
        message: "Credential projectId mismatch",
        requiredCapabilities: PHASE_5J_REQUIRED_IAM_CAPABILITIES,
        grantedPermissions: [],
        missingPermissions: [...PHASE_5J_REQUIRED_IAM_CAPABILITIES],
        authCreateAttempted: false,
        firestoreCreateAttempted: false,
      };
    }

    const tester =
      input?.permissionTester ??
      (await createDefaultPhase5JIamPermissionTester());
    const grantedRaw = await tester.testIamPermissions({
      projectId: PHASE_5J_EXPECTED_PROJECT_ID,
      permissions: PHASE_5J_REQUIRED_IAM_CAPABILITIES,
    });
    const missing = computeMissing(grantedRaw);
    const granted = PHASE_5J_REQUIRED_IAM_CAPABILITIES.filter((p) =>
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
        requiredCapabilities: PHASE_5J_REQUIRED_IAM_CAPABILITIES,
        grantedPermissions: granted,
        missingPermissions: missing,
        authCreateAttempted: false,
        firestoreCreateAttempted: false,
      };
    }

    return {
      ok: true,
      status: "IAM_PREFLIGHT_PASS",
      mode: "check_only",
      mutationsPerformed: 0,
      iamChanges: 0,
      projectId: PHASE_5J_EXPECTED_PROJECT_ID,
      credentialKind: creds.kind,
      requiredCapabilities: PHASE_5J_REQUIRED_IAM_CAPABILITIES,
      grantedPermissions: granted,
      missingPermissions: [],
      authCreateAttempted: false,
      firestoreCreateAttempted: false,
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
      requiredCapabilities: PHASE_5J_REQUIRED_IAM_CAPABILITIES,
      grantedPermissions: [],
      missingPermissions: [...PHASE_5J_REQUIRED_IAM_CAPABILITIES],
      authCreateAttempted: false,
      firestoreCreateAttempted: false,
    };
  }
}
