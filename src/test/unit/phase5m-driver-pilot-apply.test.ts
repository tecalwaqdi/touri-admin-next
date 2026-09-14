// @vitest-environment node
/**
 * Phase 5M — offline / Fake tests (§24).
 * Production writes = 0 in default SKIP paths; Fake apply proves pipeline only.
 */
import { describe, expect, it } from "vitest";
import { isPhase5MDriverPilotApplyEnabled } from "@/application/controlled-writes/pilot/isPhase5MDriverPilotApplyEnabled";
import { evaluatePhase5MOperatorGates } from "@/application/controlled-writes/pilot/Phase5MOperatorGates";
import {
  derivePhase5MRequiredOperatorIamPermissions,
  PHASE_5M_AUTH_TRIGGER_OWNERSHIP,
  PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS,
} from "@/application/controlled-writes/pilot/Phase5MIamDerivation";
import { runPhase5MIamPreflight } from "@/application/controlled-writes/pilot/Phase5MIamPreflight";
import { planPhase5MTemporaryCustomRole } from "@/application/controlled-writes/pilot/Phase5MIamRolePlan";
import {
  evaluatePhase5MExactDomainDiff,
  PHASE_5M_EXACT_DOMAIN_DIFF,
} from "@/application/controlled-writes/pilot/Phase5MExactDomainDiff";
import {
  PHASE_5M_CONSOLIDATED_WRITE_ORDER,
  PHASE_5M_EXPECTED_WRITE_COUNTS,
} from "@/application/controlled-writes/pilot/Phase5MExpectedWriteCounts";
import {
  PHASE_5M_PARTIAL_FAILURE_OUTCOMES,
  retryAllowedForPartialFailure,
} from "@/application/controlled-writes/pilot/Phase5MPartialFailure";
import {
  buildPhase5MSuperAdminActor,
  runPhase5MDriverPilotApply,
} from "@/application/controlled-writes/pilot/Phase5MDriverPilotApply";
import { createPhase5MFakeApplyPorts } from "@/application/controlled-writes/pilot/Phase5MFakePorts";
import { PHASE_5M_PILOT_IDEMPOTENCY_KEY } from "@/application/controlled-writes/pilot/isPhase5MDriverPilotApplyEnabled";
import type { Phase5KRegistrySourceResult } from "@/application/controlled-writes/pilot/Phase5KRegistrySource";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyPhase5MLiveProductionWriteEnvironment,
  applyPhase5MOperatorLiveEnvironment,
  capturePhase5MOperatorLiveGates,
} from "@/test/helpers/phase5mOperatorLiveEnv";
import { PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES } from "@/application/controlled-writes/pilot/Phase5MLiveWriteContract";
import { loadEnv, resetEnvCache } from "@/config/env";
import { permissionsForRole } from "@/permissions/rbac";
import type { VerifiedDriverWriteActor } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE } from "@/application/controlled-writes/drivers/DriverWriteFlags";

const REGISTRY_OK: Phase5KRegistrySourceResult = {
  ok: true,
  uid: "phase5m_offline_fixture_uid_001",
  logicalFixtureNameMatch: true,
  provisioningStatusMatch: true,
  status: "pilot_ready",
  registryPath: ".local/phase5j-fixture/registry.json",
};

const GATES_OK = {
  PHASE5M_DRIVER_PILOT_APPLY: "1",
  GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
  PRODUCTION_WRITE_ENABLED: "true",
  DRIVER_WRITE_ENABLED: "true",
  AGENT_WRITE_ENABLED: "false",
  CUSTOMER_WRITE_ENABLED: "false",
  CUSTOMER_AUTH_WRITE_ENABLED: "false",
  FINANCE_WRITE_ENABLED: "false",
  SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "false",
  EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
  GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
} as const;

function iamPassTester() {
  return {
    async testIamPermissions() {
      return [...PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS];
    },
  };
}

function iamFailTester(missing: string[]) {
  return {
    async testIamPermissions() {
      return PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS.filter(
        (p) => !missing.includes(p),
      );
    },
  };
}

const fakeCreds = {
  name: "Phase5MOfflineIamCredential",
  async getCredentials() {
    return {
      projectId: "tutorial-multi-language-70gx4j" as const,
      kind: "fake" as const,
    };
  },
};

describe("Phase 5M — gate exact-1", () => {
  it("flag absent / 0 / true → disabled", () => {
    expect(isPhase5MDriverPilotApplyEnabled(undefined)).toBe(false);
    expect(isPhase5MDriverPilotApplyEnabled("0")).toBe(false);
    expect(isPhase5MDriverPilotApplyEnabled("true")).toBe(false);
  });

  it("flag 1 → armed", () => {
    expect(isPhase5MDriverPilotApplyEnabled("1")).toBe(true);
  });
});

describe("Phase 5M — operator gates", () => {
  it("missing write flags → PILOT_APPLY_DISABLED", () => {
    const g = evaluatePhase5MOperatorGates({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("PILOT_APPLY_DISABLED");
  });

  it("finance true → UNSAFE_WRITE_CONFIGURATION", () => {
    const g = evaluatePhase5MOperatorGates({
      ...GATES_OK,
      FINANCE_WRITE_ENABLED: "true",
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("UNSAFE_WRITE_CONFIGURATION");
  });

  it("all gates → ok", () => {
    const g = evaluatePhase5MOperatorGates(GATES_OK);
    expect(g.ok).toBe(true);
  });
});

describe("Phase 5M — IAM derivation / Auth ownership / role plan", () => {
  it("derived operator IAM includes update+create+get+auth.get", () => {
    const perms = derivePhase5MRequiredOperatorIamPermissions();
    expect(perms).toEqual([
      "datastore.entities.get",
      "datastore.entities.update",
      "datastore.entities.create",
      "firebaseauth.users.get",
    ]);
  });

  it("operatorAuthWritePermissionRequired=false (CF owns claims)", () => {
    expect(
      PHASE_5M_AUTH_TRIGGER_OWNERSHIP.operatorAuthWritePermissionRequired,
    ).toBe(false);
    expect(PHASE_5M_AUTH_TRIGGER_OWNERSHIP.authClaimWrites).toBe(1);
  });

  it("temp custom role plan is plan_only with missing perms only", () => {
    const plan = planPhase5MTemporaryCustomRole({
      missingPermissions: [
        "datastore.entities.update",
        "datastore.entities.create",
      ],
    });
    expect(plan.createRole).toBe(false);
    expect(plan.grantRole).toBe(false);
    expect(plan.includedPermissions).toEqual([
      "datastore.entities.update",
      "datastore.entities.create",
    ]);
    expect(plan.operatorAuthWritePermissionRequired).toBe(false);
  });
});

describe("Phase 5M — exact diff / write order / partial failure", () => {
  it("exact domain diff is registration_status needs_changes only", () => {
    expect(PHASE_5M_EXACT_DOMAIN_DIFF).toEqual({
      registration_status: "needs_changes",
    });
    expect(evaluatePhase5MExactDomainDiff().ok).toBe(true);
    const bad = evaluatePhase5MExactDomainDiff({
      patch: { registration_status: "needs_changes", actev_mndob: true },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("PILOT_DIFF_VIOLATION");
  });

  it("write order documents audit intent before domain", () => {
    const intentIdx = PHASE_5M_CONSOLIDATED_WRITE_ORDER.indexOf("audit_intent");
    const domainIdx = PHASE_5M_CONSOLIDATED_WRITE_ORDER.indexOf(
      "controlled_repo_domain_update",
    );
    expect(intentIdx).toBeGreaterThanOrEqual(0);
    expect(domainIdx).toBeGreaterThan(intentIdx);
    expect(PHASE_5M_EXPECTED_WRITE_COUNTS.driverDomainWrites).toBe(1);
  });

  it("partial failure never blind-retries committed write", () => {
    expect(PHASE_5M_PARTIAL_FAILURE_OUTCOMES.length).toBeGreaterThanOrEqual(5);
    expect(retryAllowedForPartialFailure("DOMAIN_COMMITTED_AUDIT_RESULT_FAILED")).toBe(
      false,
    );
    expect(retryAllowedForPartialFailure("PILOT_ALREADY_APPLIED")).toBe(false);
  });
});

describe("Phase 5M — IAM preflight check-only (fake tester)", () => {
  it("missing update+create → IAM_PREFLIGHT_FAILED", async () => {
    const pre = await runPhase5MIamPreflight({
      permissionTester: iamFailTester([
        "datastore.entities.update",
        "datastore.entities.create",
      ]),
      credentialProvider: fakeCreds,
    });
    expect(pre.mutationsPerformed).toBe(0);
    expect(pre.iamChanges).toBe(0);
    expect(pre.ok).toBe(false);
    if (!pre.ok) {
      expect(pre.missingPermissions).toEqual(
        expect.arrayContaining([
          "datastore.entities.update",
          "datastore.entities.create",
        ]),
      );
    }
  });

  it("all granted → IAM_PREFLIGHT_PASS", async () => {
    const pre = await runPhase5MIamPreflight({
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(pre.ok).toBe(true);
    expect(pre.mutationsPerformed).toBe(0);
  });
});

describe("Phase 5M — Fake apply pipeline", () => {
  it("default harness SKIP → writes 0", async () => {
    const r = await runPhase5MDriverPilotApply({ harnessArmed: false });
    expect(r.summary.overallStatus).toBe("SKIPPED");
    expect(r.summary.productionWrites).toBe(0);
    expect(r.summary.applyAttempted).toBe(false);
  });

  it("happy path Fake apply → PHASE5M_DRIVER_PILOT_WRITE_PASS", async () => {
    const ports = createPhase5MFakeApplyPorts({
      uid: REGISTRY_OK.uid,
    });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.overallStatus).toBe("PHASE5M_DRIVER_PILOT_WRITE_PASS");
    expect(r.summary.pilotWriteProven).toBe(true);
    expect(r.summary.actualDriverDomainWrites).toBe(1);
    expect(r.summary.actualAuditIntentWrites).toBe(1);
    expect(r.summary.actualAuditResultWrites).toBe(1);
    expect(r.summary.actualIdempotencyWrites).toBe(1);
    expect(r.summary.afterState).toBe("needs_changes");
    expect(r.summary.forbiddenFieldsUnchanged).toBe(true);
    expect(r.summary.financeWrites).toBe(0);
    expect(r.summary.idempotencyKeyLogical).toBe(PHASE_5M_PILOT_IDEMPOTENCY_KEY);
  });

  it("wrong state → PILOT_PRECONDITION_FAILED", async () => {
    const ports = createPhase5MFakeApplyPorts({
      uid: REGISTRY_OK.uid,
      firestoreData: { registration_status: "approved" },
      snapshot: {
        driverId: REGISTRY_OK.uid,
        exists: true,
        isOperationalDriver: true,
        registrationStatus: "approved",
        accountEnabled: "disabled",
        complianceStatus: "unknown",
        tripState: "idle",
        countryId: "saudi_arabia",
        countryScopeKind: "mapped",
        preconditionToken: "tok",
      },
    });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.overallStatus).toBe("PILOT_PRECONDITION_FAILED");
    expect(r.summary.actualDriverDomainWrites).toBe(0);
  });

  it("idempotency already applied → PILOT_ALREADY_APPLIED", async () => {
    const ports = createPhase5MFakeApplyPorts({
      uid: REGISTRY_OK.uid,
      existingIdempotency: {
        key: PHASE_5M_PILOT_IDEMPOTENCY_KEY,
        fingerprint: "x",
        result: {
          ok: true,
          status: "applied",
          action: "needs_changes",
          driverId: REGISTRY_OK.uid,
          fromState: "pending_review",
          toState: "needs_changes",
          auditIntentId: "i",
          auditResultId: "r",
          productionWriteExecuted: false,
        },
        createdAtUtc: new Date().toISOString(),
      },
    });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.overallStatus).toBe("PILOT_ALREADY_APPLIED");
    expect(r.summary.actualDriverDomainWrites).toBe(0);
  });

  it("non super_admin → RBAC NO_GO", async () => {
    const auditor: VerifiedDriverWriteActor = {
      uid: "aud",
      role: "auditor",
      permissions: permissionsForRole("auditor"),
      scope: { type: "global" },
    };
    const ports = createPhase5MFakeApplyPorts({ uid: REGISTRY_OK.uid });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: auditor,
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.overallStatus).toBe("PHASE5M_DRIVER_PILOT_WRITE_NO_GO");
    expect(r.summary.actualDriverDomainWrites).toBe(0);
  });

  it("audit intent fail → no domain write", async () => {
    const ports = createPhase5MFakeApplyPorts({
      uid: REGISTRY_OK.uid,
      failAuditIntent: true,
    });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.actualDriverDomainWrites).toBe(0);
    expect(
      r.summary.overallStatus === "PARTIAL_FAILURE" ||
        r.summary.overallStatus === "PHASE5M_DRIVER_PILOT_WRITE_NO_GO",
    ).toBe(true);
  });

  it("IAM skip (runIamPreflight=false) → applyAttempted=false writes=0", async () => {
    const ports = createPhase5MFakeApplyPorts({ uid: REGISTRY_OK.uid });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      runIamPreflight: false,
    });
    expect(r.summary.overallStatus).toBe("IAM_PREFLIGHT_FAILED");
    expect(r.summary.applyAttempted).toBe(false);
    expect(r.summary.actualDriverDomainWrites).toBe(0);
    expect(r.summary.productionWrites).toBe(0);
    expect(r.summary.iamMissing).toEqual(
      expect.arrayContaining(["datastore.entities.create"]),
    );
  });

  it("happy path populates iamPreflightStatus PASS before writes", async () => {
    const ports = createPhase5MFakeApplyPorts({ uid: REGISTRY_OK.uid });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.iamPreflightStatus).toBe("IAM_PREFLIGHT_PASS");
    expect(r.summary.iamGranted).toEqual(
      expect.arrayContaining(["datastore.entities.create"]),
    );
    expect(r.summary.iamMissing).toEqual([]);
  });

  it("AUDIT_INTENT_PERMISSION_DENIED → no later writes; IAM fields populated", async () => {
    const ports = createPhase5MFakeApplyPorts({
      uid: REGISTRY_OK.uid,
      failAuditIntentPermissionDenied: true,
    });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.denials).toContain("AUDIT_INTENT_PERMISSION_DENIED");
    expect(r.summary.iamPreflightStatus).toBe("IAM_PREFLIGHT_PASS");
    expect(r.summary.actualAuditIntentWrites).toBe(0);
    expect(r.summary.actualDriverDomainWrites).toBe(0);
    expect(r.summary.actualIdempotencyWrites).toBe(0);
    expect(r.summary.actualAuditResultWrites).toBe(0);
  });

  it("DRIVER_DOMAIN_PERMISSION_DENIED → after intent only; no idempotency/result", async () => {
    const ports = createPhase5MFakeApplyPorts({
      uid: REGISTRY_OK.uid,
      failDriverDomainPermissionDenied: true,
    });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.denials).toContain("DRIVER_DOMAIN_PERMISSION_DENIED");
    expect(r.summary.iamPreflightStatus).toBe("IAM_PREFLIGHT_PASS");
    expect(r.summary.actualAuditIntentWrites).toBe(1);
    expect(r.summary.actualDriverDomainWrites).toBe(0);
    expect(r.summary.actualIdempotencyWrites).toBe(0);
  });

  it("IDEMPOTENCY_PERMISSION_DENIED on get → applyAttempted=false writes=0", async () => {
    const ports = createPhase5MFakeApplyPorts({
      uid: REGISTRY_OK.uid,
      failIdempotencyGetPermissionDenied: true,
    });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.denials).toContain("IDEMPOTENCY_PERMISSION_DENIED");
    expect(r.summary.applyAttempted).toBe(false);
    expect(r.summary.iamPreflightStatus).toBe("IAM_PREFLIGHT_PASS");
    expect(r.summary.actualDriverDomainWrites).toBe(0);
    expect(r.summary.actualAuditIntentWrites).toBe(0);
  });

  it("AUDIT_RESULT_PERMISSION_DENIED classifies independently after domain", async () => {
    const ports = createPhase5MFakeApplyPorts({
      uid: REGISTRY_OK.uid,
      failAuditResultPermissionDenied: true,
    });
    const r = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: GATES_OK,
      actor: buildPhase5MSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
      executeApply: true,
      permissionTester: iamPassTester(),
      credentialProvider: fakeCreds,
    });
    expect(r.summary.denials).toContain("AUDIT_RESULT_PERMISSION_DENIED");
    expect(r.summary.iamPreflightStatus).toBe("IAM_PREFLIGHT_PASS");
    expect(r.summary.actualDriverDomainWrites).toBe(1);
    expect(r.summary.actualAuditIntentWrites).toBe(1);
  });

  it("global hard-lock + enablement remain false", () => {
    expect(DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
  });
});

describe("Phase 5M — permission-denied classifier", () => {
  it("maps gRPC 7 to stage codes without retry", async () => {
    const {
      classifyPhase5MStagePermissionDenied,
      isFirestoreAdminPermissionDenied,
    } = await import(
      "@/application/controlled-writes/pilot/Phase5MPermissionDeniedClassification"
    );
    const err = { code: 7, message: "7 PERMISSION_DENIED: Missing or insufficient permissions." };
    expect(isFirestoreAdminPermissionDenied(err)).toBe(true);
    const classified = classifyPhase5MStagePermissionDenied("AUDIT_INTENT", err);
    expect(classified?.code).toBe("AUDIT_INTENT_PERMISSION_DENIED");
    expect(classified?.message).not.toMatch(/password|private_key|eyJ/i);
  });
});

describe("Phase 5M — env sanitization", () => {
  it("PHASE5M arm preserved; write flags cleared globally; live capture restores", () => {
    const captured = captureOperatorHarnessEnv({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "phase5m_test_token",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "phase5m_test_token",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5M_DRIVER_PILOT_APPLY).toBe("1");
    expect(env.FIREBASE_ID_TOKEN).toBe("phase5m_test_token");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }

    const liveCap = capturePhase5MOperatorLiveGates({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
      FIREBASE_ID_TOKEN: "phase5m_test_token",
    });
    const liveEnv: Record<string, string | undefined> = {
      APP_ENV: "development",
      EXPECTED_ENVIRONMENT: "development",
      FIREBASE_ID_TOKEN: "phase5m_test_token",
    };
    applyPhase5MOperatorLiveEnvironment(liveCap, liveEnv);
    expect(liveEnv.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("true");
    expect(liveEnv.DRIVER_WRITE_ENABLED).toBe("true");
    expect(liveEnv.FINANCE_WRITE_ENABLED).toBe("false");
  });

  it("full Production write env → loadEnv PASS after development wipe", () => {
    process.env.APP_ENV = "development";
    process.env.EXPECTED_ENVIRONMENT = "development";
    process.env.PRODUCTION_WRITE_ENABLED = "false";
    process.env.FIREBASE_ID_TOKEN = "phase5m_full_env_token";
    resetEnvCache();

    applyPhase5MLiveProductionWriteEnvironment({
      capturedGates: {
        PHASE5M_DRIVER_PILOT_APPLY: "1",
        GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
        PRODUCTION_WRITE_ENABLED: "true",
        DRIVER_WRITE_ENABLED: "true",
        EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
        GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
        FIREBASE_ID_TOKEN: "phase5m_full_env_token",
      },
    });
    const env = loadEnv();
    expect(env.APP_ENV).toBe("production");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(true);
    expect(env.DRIVER_WRITE_ENABLED).toBe(true);
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe(
      PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES,
    );
    expect(process.env.FIREBASE_ID_TOKEN).toBe("phase5m_full_env_token");

    // Restore safe defaults for other unit tests in this file.
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.APP_ENV = "development";
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    process.env.EXPECTED_ENVIRONMENT = "development";
    process.env.PRODUCTION_WRITE_ENABLED = "false";
    process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
    process.env.DRIVER_WRITE_ENABLED = "false";
    process.env.PHASE5M_DRIVER_PILOT_APPLY = "";
    process.env.AUTH_MODE = "mock";
    process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
    resetEnvCache();
  });
});
