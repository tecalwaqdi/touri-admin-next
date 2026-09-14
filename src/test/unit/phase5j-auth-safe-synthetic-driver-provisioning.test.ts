/**
 * Phase 5J — Auth-safe synthetic Driver provisioning (fake ports).
 * Covers: happy path, Auth fail, Firestore fail, claim timeout, elevated claims,
 * canonical fail, idempotent rerun, partial recovery detection.
 * Production / Auth / Firestore real writes = 0.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  evaluatePhase5JOperatorGates,
} from "@/application/controlled-writes/pilot/Phase5JOperatorGates";
import {
  createProvisionSyntheticDriverFixtureCommand,
} from "@/application/controlled-writes/pilot/ProvisionSyntheticDriverFixtureCommand";
import {
  createSyntheticDriverProvisioningService,
} from "@/application/controlled-writes/pilot/SyntheticDriverProvisioningService";
import {
  FakePhase5JAuthPort,
  FakePhase5JFirestorePort,
  createHappyPathPhase5JFakes,
} from "@/application/controlled-writes/pilot/Phase5JFakePorts";
import { Phase5JMemoryAuditPort } from "@/application/controlled-writes/pilot/Phase5JProvisioningPorts";
import {
  PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS,
  assertExactPhase5JSuccessWriteCounts,
} from "@/application/controlled-writes/pilot/Phase5JExpectedWriteCounts";
import {
  evaluatePhase5JIdempotency,
  loadPhase5JOperatorRegistry,
  savePhase5JOperatorRegistry,
  buildEmptyPhase5JRegistryRecord,
} from "@/application/controlled-writes/pilot/Phase5JOperatorRegistry";
import { PHASE_5I_EXPECTED_CUSTOM_CLAIMS } from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";
import {
  isPhase5JProvisionSyntheticDriverEnabled,
} from "@/application/controlled-writes/pilot/isPhase5JSyntheticDriverProvisionEnabled";
import { runPhase5JIamPreflight } from "@/application/controlled-writes/pilot/Phase5JIamPreflight";
import { runPhase5JProvisionHarnessFlow } from "@/application/controlled-writes/pilot/Phase5JProvisionHarnessFlow";
import { FakeProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  PHASE_5J_FIXTURE_STATE_MACHINE,
} from "@/application/controlled-writes/pilot/Phase5JFixtureStateMachine";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
  OPERATOR_HARNESS_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";

const OPEN_GATES = {
  PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
  SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
  GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
  PRODUCTION_WRITE_ENABLED: "true",
  DRIVER_WRITE_ENABLED: "true",
  AGENT_WRITE_ENABLED: "false",
  CUSTOMER_WRITE_ENABLED: "false",
  CUSTOMER_AUTH_WRITE_ENABLED: "false",
  FINANCE_WRITE_ENABLED: "false",
  EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
  GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
} as const;

const PROJECT_CREDS = new FakeProductionCredentialProvider({
  projectId: "tutorial-multi-language-70gx4j",
  kind: "fake",
});

const IAM_PASS_TESTER = {
  async testIamPermissions() {
    return [
      "firebaseauth.users.create",
      "firebaseauth.users.get",
      "datastore.entities.create",
      "datastore.entities.get",
    ];
  },
};

const IAM_MISSING_CREATE_TESTER = {
  async testIamPermissions() {
    return ["firebaseauth.users.get", "datastore.entities.get"];
  },
};

function tempRegistryCwd(): string {
  return mkdtempSync(join(tmpdir(), "phase5j-reg-"));
}

describe("Phase 5J — operator gates", () => {
  it("missing required → PROVISIONING_WRITE_DISABLED", () => {
    const g = evaluatePhase5JOperatorGates({});
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("PROVISIONING_WRITE_DISABLED");
  });

  it("finance true → UNSAFE_WRITE_CONFIGURATION", () => {
    const g = evaluatePhase5JOperatorGates({
      ...OPEN_GATES,
      FINANCE_WRITE_ENABLED: "true",
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("UNSAFE_WRITE_CONFIGURATION");
  });

  it("all required + forbidden false → ok", () => {
    const g = evaluatePhase5JOperatorGates(OPEN_GATES);
    expect(g.ok).toBe(true);
  });

  it("GOOGLE_CLOUD_PROJECT required and must match", () => {
    const missing = evaluatePhase5JOperatorGates({
      ...OPEN_GATES,
      GOOGLE_CLOUD_PROJECT: undefined,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.code).toBe("PROVISIONING_WRITE_DISABLED");
      expect(missing.missingRequired).toContain("GOOGLE_CLOUD_PROJECT");
    }
    const mismatch = evaluatePhase5JOperatorGates({
      ...OPEN_GATES,
      GOOGLE_CLOUD_PROJECT: "other-project",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe("PROJECT_ID_MISMATCH");
  });

  it("PHASE5J harness flag exact-1", () => {
    expect(isPhase5JProvisionSyntheticDriverEnabled(undefined)).toBe(false);
    expect(isPhase5JProvisionSyntheticDriverEnabled("true")).toBe(false);
    expect(isPhase5JProvisionSyntheticDriverEnabled("1")).toBe(true);
  });
});

describe("Phase 5J — fake provision scenarios", () => {
  it("happy path → pilot_ready with exact write counts", async () => {
    const cwd = tempRegistryCwd();
    const { auth, firestore } = createHappyPathPhase5JFakes();
    const audit = new Phase5JMemoryAuditPort();
    const svc = createSyntheticDriverProvisioningService({
      ports: { auth, firestore, audit },
      registryCwd: cwd,
      persistRegistry: true,
      claimMaxAttempts: 3,
      claimIntervalMs: 0,
      sleep: async () => undefined,
    });

    const r = await svc.provision({
      gates: OPEN_GATES,
      command: createProvisionSyntheticDriverFixtureCommand({
        requestId: "req_happy",
      }),
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("pilot_ready");
      expect(r.authSafeSummary.disabled).toBe(true);
      expect(r.authSafeSummary.email).toBeNull();
      expect(r.authSafeSummary.phoneNumber).toBeNull();
      expect(assertExactPhase5JSuccessWriteCounts(r.writeCounts).ok).toBe(true);
      expect(r.writeCounts).toEqual(PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS);
      expect(r.financeWrites).toBe(0);
      expect(r.tripWrites).toBe(0);
    }
    expect(auth.createCalls).toBe(1);
    expect(firestore.createCalls).toBe(1);
    expect(audit.intents).toHaveLength(1);
    expect(audit.results).toHaveLength(1);

    const reg = loadPhase5JOperatorRegistry(cwd);
    expect(reg.status).toBe("pilot_ready");
    expect(reg.uid).toBeTruthy();
    expect(reg.passwordStored).toBe(false);
    expect(reg.emailStored).toBe(false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it("Auth fail → failed_partial; no Firestore create", async () => {
    const cwd = tempRegistryCwd();
    const auth = new FakePhase5JAuthPort({ failCreate: true });
    const firestore = new FakePhase5JFirestorePort();
    const svc = createSyntheticDriverProvisioningService({
      ports: { auth, firestore, audit: new Phase5JMemoryAuditPort() },
      registryCwd: cwd,
      persistRegistry: true,
      sleep: async () => undefined,
    });

    const r = await svc.provision({ gates: OPEN_GATES });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("AUTH_CREATE_FAILED");
      expect(r.writeCounts.authCreate).toBe(0);
      expect(r.writeCounts.firestoreUserCreates).toBe(0);
    }
    expect(firestore.createCalls).toBe(0);
    rmSync(cwd, { recursive: true, force: true });
  });

  it("Firestore fail → failed_partial_auth_only; no second Auth create", async () => {
    const cwd = tempRegistryCwd();
    const auth = new FakePhase5JAuthPort({
      syncedClaims: { ...PHASE_5I_EXPECTED_CUSTOM_CLAIMS },
    });
    const firestore = new FakePhase5JFirestorePort({ failCreate: true });
    const svc = createSyntheticDriverProvisioningService({
      ports: { auth, firestore, audit: new Phase5JMemoryAuditPort() },
      registryCwd: cwd,
      persistRegistry: true,
      sleep: async () => undefined,
    });

    const r = await svc.provision({ gates: OPEN_GATES });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("FIRESTORE_CREATE_FAILED");
      expect(r.status).toBe("failed_partial_auth_only");
      expect(r.uid).toBeTruthy();
      expect(r.writeCounts.authCreate).toBe(1);
      expect(r.writeCounts.firestoreUserCreates).toBe(0);
    }
    expect(auth.createCalls).toBe(1);

    // Rerun detects partial — no multi Auth.
    const r2 = await svc.provision({ gates: OPEN_GATES });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.code).toBe("FAILED_PARTIAL_NO_MULTI_CREATE");
    }
    expect(auth.createCalls).toBe(1);
    rmSync(cwd, { recursive: true, force: true });
  });

  it("claim timeout → CLAIM_SYNC_TIMEOUT; not pilot_ready", async () => {
    const cwd = tempRegistryCwd();
    const auth = new FakePhase5JAuthPort({
      syncedClaims: {},
      syncAfterAttempts: 99,
    });
    const firestore = new FakePhase5JFirestorePort();
    const svc = createSyntheticDriverProvisioningService({
      ports: { auth, firestore, audit: new Phase5JMemoryAuditPort() },
      registryCwd: cwd,
      persistRegistry: true,
      claimMaxAttempts: 3,
      claimIntervalMs: 0,
      sleep: async () => undefined,
    });

    const r = await svc.provision({ gates: OPEN_GATES });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("CLAIM_SYNC_TIMEOUT");
      expect(r.status).toBe("failed_partial_claims");
      expect(r.writeCounts.firestoreUserCreates).toBe(1);
    }
    rmSync(cwd, { recursive: true, force: true });
  });

  it("elevated claims → UNEXPECTED_FIXTURE_CLAIMS; not pilot_ready", async () => {
    const cwd = tempRegistryCwd();
    const auth = new FakePhase5JAuthPort({
      syncedClaims: {
        country_id: "countries/saudi_arabia",
        super_admin: true,
      },
      syncAfterAttempts: 1,
    });
    const firestore = new FakePhase5JFirestorePort();
    const svc = createSyntheticDriverProvisioningService({
      ports: { auth, firestore, audit: new Phase5JMemoryAuditPort() },
      registryCwd: cwd,
      persistRegistry: true,
      claimMaxAttempts: 3,
      claimIntervalMs: 0,
      sleep: async () => undefined,
    });

    const r = await svc.provision({ gates: OPEN_GATES });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("UNEXPECTED_FIXTURE_CLAIMS");
      expect(r.status).toBe("failed_partial_claims");
    }
    rmSync(cwd, { recursive: true, force: true });
  });

  it("canonical fail → CANONICAL_FIXTURE_VERIFICATION_FAILED", async () => {
    const cwd = tempRegistryCwd();
    const auth = new FakePhase5JAuthPort({
      syncedClaims: { ...PHASE_5I_EXPECTED_CUSTOM_CLAIMS },
      syncAfterAttempts: 1,
    });
    const firestore = new FakePhase5JFirestorePort({
      mutateStoredDoc: (doc) => ({ ...doc, actev_mndob: true }),
    });
    const svc = createSyntheticDriverProvisioningService({
      ports: { auth, firestore, audit: new Phase5JMemoryAuditPort() },
      registryCwd: cwd,
      persistRegistry: true,
      claimMaxAttempts: 2,
      claimIntervalMs: 0,
      sleep: async () => undefined,
    });

    const r = await svc.provision({ gates: OPEN_GATES });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("CANONICAL_FIXTURE_VERIFICATION_FAILED");
      expect(r.status).toBe("failed_partial_canonical");
    }
    rmSync(cwd, { recursive: true, force: true });
  });

  it("idempotent rerun when pilot_ready → refuse second Auth", async () => {
    const cwd = tempRegistryCwd();
    const { auth, firestore } = createHappyPathPhase5JFakes();
    const svc = createSyntheticDriverProvisioningService({
      ports: { auth, firestore, audit: new Phase5JMemoryAuditPort() },
      registryCwd: cwd,
      persistRegistry: true,
      claimMaxAttempts: 2,
      claimIntervalMs: 0,
      sleep: async () => undefined,
    });

    const first = await svc.provision({ gates: OPEN_GATES });
    expect(first.ok).toBe(true);
    expect(auth.createCalls).toBe(1);

    const second = await svc.provision({ gates: OPEN_GATES });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("PILOT_READY_IDEMPOTENT");
    }
    expect(auth.createCalls).toBe(1);
    rmSync(cwd, { recursive: true, force: true });
  });

  it("partial recovery detection: auth_created → RESUME_FIRESTORE_ONLY", () => {
    const reg = {
      ...buildEmptyPhase5JRegistryRecord(),
      uid: "partial_uid_1",
      status: "auth_created" as const,
      requestId: "req_partial",
    };
    const d = evaluatePhase5JIdempotency(reg);
    expect(d.allowAuthCreate).toBe(false);
    expect(d.code).toBe("RESUME_FIRESTORE_ONLY");
    expect(d.uid).toBe("partial_uid_1");
  });
});

describe("Phase 5J — command / state machine / IAM / sanitization", () => {
  it("typed command allowlist; no arbitrary payload", () => {
    const cmd = createProvisionSyntheticDriverFixtureCommand();
    expect(cmd.kind).toBe("ProvisionSyntheticDriverFixture");
    expect(cmd.arbitraryPayloadAllowed).toBe(false);
    expect(cmd.merge).toBe(false);
    expect(cmd.overwrite).toBe(false);
    expect(cmd.createOnly).toBe(true);
    expect(cmd.authCreate.disabled).toBe(true);
    expect(cmd.authCreate.email).toBeUndefined();
    expect(cmd.firestoreDoc.ismndob).toBe(true);
  });

  it("state machine includes claims_verified → fixture_verified → pilot_ready", () => {
    const vias = PHASE_5J_FIXTURE_STATE_MACHINE.map((t) => `${t.from}->${t.to}`);
    expect(vias).toContain("firestore_created->claims_verified");
    expect(vias).toContain("claims_verified->fixture_verified");
    expect(vias).toContain("fixture_verified->pilot_ready");
  });

  it("IAM preflight check-only; refuses SA keys; reports missingPermissions; mutations=0", async () => {
    const withKey = await runPhase5JIamPreflight({
      projectId: "tutorial-multi-language-70gx4j",
      credentialProvider: PROJECT_CREDS,
      permissionTester: IAM_MISSING_CREATE_TESTER,
    });
    expect(withKey.mutationsPerformed).toBe(0);
    expect(withKey.iamChanges).toBe(0);
    expect(withKey.mode).toBe("check_only");
    expect(withKey.ok).toBe(false);
    if (!withKey.ok) {
      expect(withKey.status).toBe("IAM_PREFLIGHT_FAILED");
      expect(withKey.missingPermissions).toEqual([
        "firebaseauth.users.create",
        "datastore.entities.create",
      ]);
      expect(withKey.grantedPermissions).toEqual([
        "firebaseauth.users.get",
        "datastore.entities.get",
      ]);
    }

    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/fake-sa.json";
    const refused = await runPhase5JIamPreflight({
      projectId: "tutorial-multi-language-70gx4j",
    });
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("SERVICE_ACCOUNT_KEY_REFUSED");
    expect(refused.mutationsPerformed).toBe(0);

    const pass = await runPhase5JIamPreflight({
      projectId: "tutorial-multi-language-70gx4j",
      credentialProvider: PROJECT_CREDS,
      permissionTester: IAM_PASS_TESTER,
    });
    expect(pass.ok).toBe(true);
    if (pass.ok) {
      expect(pass.status).toBe("IAM_PREFLIGHT_PASS");
      expect(pass.missingPermissions).toEqual([]);
      expect(pass.grantedPermissions).toHaveLength(4);
    }

    void FakeProductionCredentialProvider;
    void ApplicationDefaultProductionCredentialProvider;
  });

  it("harness flow: no flag → SKIP; armed+missing gates → GATED_REFUSED; missing IAM → zero writes; valid IAM → provision may execute", async () => {
    const skip = await runPhase5JProvisionHarnessFlow({ harnessArmed: false });
    expect(skip.summary.overallStatus).toBe("SKIPPED");
    expect(skip.summary.provisionAttempted).toBe(false);
    expect(skip.summary.authWrites).toBe(0);

    const gated = await runPhase5JProvisionHarnessFlow({
      harnessArmed: true,
      gates: {},
    });
    expect(gated.summary.overallStatus).toBe("GATED_REFUSED");
    expect(gated.summary.provisionAttempted).toBe(false);

    let provisionCalls = 0;
    const iamFail = await runPhase5JProvisionHarnessFlow({
      harnessArmed: true,
      gates: OPEN_GATES,
      credentialProvider: PROJECT_CREDS,
      permissionTester: IAM_MISSING_CREATE_TESTER,
      runProvision: async () => {
        provisionCalls += 1;
        throw new Error("must not provision when IAM fails");
      },
    });
    expect(iamFail.summary.overallStatus).toBe("IAM_PREFLIGHT_FAILED");
    expect(iamFail.summary.provisionAttempted).toBe(false);
    expect(iamFail.summary.authWrites).toBe(0);
    expect(iamFail.summary.firestoreWrites).toBe(0);
    expect(provisionCalls).toBe(0);
    expect(iamFail.iam?.mutationsPerformed).toBe(0);
    expect(iamFail.iam?.iamChanges).toBe(0);

    const cwd = tempRegistryCwd();
    const { auth, firestore } = createHappyPathPhase5JFakes();
    const svc = createSyntheticDriverProvisioningService({
      ports: { auth, firestore, audit: new Phase5JMemoryAuditPort() },
      registryCwd: cwd,
      persistRegistry: true,
      claimMaxAttempts: 3,
      claimIntervalMs: 0,
      sleep: async () => undefined,
    });
    const iamOk = await runPhase5JProvisionHarnessFlow({
      harnessArmed: true,
      gates: OPEN_GATES,
      credentialProvider: PROJECT_CREDS,
      permissionTester: IAM_PASS_TESTER,
      runProvision: () =>
        svc.provision({
          gates: OPEN_GATES,
          command: createProvisionSyntheticDriverFixtureCommand({
            requestId: "req_harness_iam_ok",
          }),
        }),
    });
    expect(iamOk.summary.overallStatus).toBe("PILOT_READY");
    expect(iamOk.summary.provisionAttempted).toBe(true);
    expect(iamOk.summary.pilotReady).toBe(true);
    expect(iamOk.summary.authCreateInvocationCount).toBe(1);
    expect(iamOk.summary.firestoreCreateInvocationCount).toBe(1);
    expect(auth.createCalls).toBe(1);
    expect(firestore.createCalls).toBe(1);
    expect(iamOk.summary.financeWrites).toBe(0);
    expect(iamOk.summary.tripWrites).toBe(0);
    expect(iamOk.summary.agentWrites).toBe(0);
    expect(iamOk.summary.customerWrites).toBe(0);
    rmSync(cwd, { recursive: true, force: true });
  });

  it("preserves PHASE5J harness flag; never write-enabling flags", () => {
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5J_PROVISION_SYNTHETIC_DRIVER",
    );
    expect(OPERATOR_HARNESS_NEVER_PRESERVE_KEYS).toEqual(
      expect.arrayContaining([
        "PHASE5I_PROVISION_SYNTHETIC_DRIVER",
        "SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED",
        "GLOBAL_PRODUCTION_WRITE_ENABLED",
        "FINANCE_WRITE_ENABLED",
      ]),
    );

    const captured = captureOperatorHarnessEnv({
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: "1",
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: undefined,
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: undefined,
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: "1",
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5J_PROVISION_SYNTHETIC_DRIVER).toBe("1");
    expect(env.PHASE5I_PROVISION_SYNTHETIC_DRIVER).toBeUndefined();
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBeUndefined();
  });

  it("registry save never stores secrets", () => {
    const cwd = tempRegistryCwd();
    savePhase5JOperatorRegistry(
      {
        ...buildEmptyPhase5JRegistryRecord(),
        uid: "u1",
        status: "auth_created",
        requestId: "r1",
      },
      cwd,
    );
    const loaded = loadPhase5JOperatorRegistry(cwd);
    expect(loaded.passwordStored).toBe(false);
    expect(loaded.tokenStored).toBe(false);
    expect(loaded.emailStored).toBe(false);
    expect(loaded.phoneStored).toBe(false);
    expect(loaded.serviceAccountStored).toBe(false);
    rmSync(cwd, { recursive: true, force: true });
  });

  it("without ports even open gates → PROVISIONING_PORTS_UNAVAILABLE", async () => {
    const svc = createSyntheticDriverProvisioningService();
    const r = await svc.provision({ gates: OPEN_GATES });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PROVISIONING_PORTS_UNAVAILABLE");
      expect(r.authWrites).toBe(0);
      expect(r.actualWrite).toBe(false);
    }
  });
});
