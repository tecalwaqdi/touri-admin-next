// @vitest-environment node
/**
 * Phase 5M — Driver Pilot apply harness (ONE controlled Production write path).
 *
 * DEFAULT: SKIP unless PHASE5M_DRIVER_PILOT_APPLY=1.
 * When armed: gates → IAM check-only → verified actor → before-state →
 * RequestDriverChangesCommand via executeDriverControlledWrite.
 *
 * THIS PREPARATION SESSION: do not arm. Do not grant IAM. Do not execute write.
 *
 * Operator (future — after IAM grant + re-check):
 *   PHASE5M_DRIVER_PILOT_APPLY=1 \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=true \
 *   PRODUCTION_WRITE_ENABLED=true \
 *   DRIVER_WRITE_ENABLED=true \
 *   AGENT_WRITE_ENABLED=false \
 *   CUSTOMER_WRITE_ENABLED=false \
 *   CUSTOMER_AUTH_WRITE_ENABLED=false \
 *   FINANCE_WRITE_ENABLED=false \
 *   SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *   FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/phase5m-driver-pilot-apply.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhase5MDriverPilotApplyEnabled } from "@/application/controlled-writes/pilot/isPhase5MDriverPilotApplyEnabled";
import {
  runPhase5MDriverPilotApply,
} from "@/application/controlled-writes/pilot/Phase5MDriverPilotApply";
import {
  emptyPhase5MApplySafeSummary,
  type Phase5MApplySafeSummary,
} from "@/application/controlled-writes/pilot/Phase5MApplySafeSummary";
import { runPhase5MIamPreflight } from "@/application/controlled-writes/pilot/Phase5MIamPreflight";
import { planPhase5MTemporaryCustomRole } from "@/application/controlled-writes/pilot/Phase5MIamRolePlan";
import { PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/controlled-writes/pilot/Phase5MIamDerivation";
import { PHASE_5M_EXPECTED_WRITE_COUNTS } from "@/application/controlled-writes/pilot/Phase5MExpectedWriteCounts";
import { createPhase5MProductionApplyPorts } from "@/application/controlled-writes/pilot/Phase5MProductionWriteAdapters";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyPhase5MLiveProductionWriteEnvironment,
  applyPhase5MOperatorLiveEnvironment,
  capturePhase5MOperatorLiveGates,
  envForPhase5MVerifiedActorResolution,
  loadPhase5MLiveProductionWriteEnv,
  readPhase5MOperatorGatesFromEnv,
} from "@/test/helpers/phase5mOperatorLiveEnv";
import {
  assertPhase5MLiveProjectFingerprint,
  assertPhase5MLiveShadowResources,
  PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES,
} from "@/application/controlled-writes/pilot/Phase5MLiveWriteContract";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";
import { resetEnvCache } from "@/config/env";
import { resolveProductionVerifiedActor } from "@/infrastructure/auth/productionVerifiedAuth";
import type { VerifiedDriverWriteActor } from "@/application/controlled-writes/drivers/DriverWriteTypes";

const LIVE = isPhase5MDriverPilotApplyEnabled(
  process.env.PHASE5M_DRIVER_PILOT_APPLY,
);

/** Capture write gates at module load — BEFORE beforeEach wipe. */
const OPERATOR_LIVE_GATES = capturePhase5MOperatorLiveGates(process.env);

const reportDir = join(process.cwd(), ".local", "phase5m-driver-pilot");
const reportPath = join(reportDir, "apply-safe-summary.json");

let report: Phase5MApplySafeSummary = emptyPhase5MApplySafeSummary({
  harnessArmed: LIVE,
  overallStatus: LIVE ? "PENDING_OPERATOR" : "SKIPPED",
  exactExpectedWriteCounts: PHASE_5M_EXPECTED_WRITE_COUNTS,
});

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  expect(serialized).not.toMatch(/password|private_key|BEGIN PRIVATE/i);
  expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  expect(serialized).not.toMatch(/"uid"\s*:/);
  expect(serialized).not.toMatch(/"preconditionToken"\s*:/);
  writeFileSync(reportPath, serialized);
}

function disableWriteFlags(): void {
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.CUSTOMER_WRITE_ENABLED = "false";
  process.env.CUSTOMER_AUTH_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED = "false";
  process.env.PHASE5M_DRIVER_PILOT_APPLY = "";
  process.env.APP_ENV = "development";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  process.env.EXPECTED_ENVIRONMENT = "development";
  process.env.AUTH_MODE = "mock";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
  // Restore Vitest NODE_ENV after armed Production write env (never leave production).
  Object.assign(process.env, { NODE_ENV: "test" });
  resetEnvCache();
}

describe("Phase 5M — Driver Pilot apply (SKIP default; operator-executable when armed)", () => {
  afterAll(() => {
    disableWriteFlags();
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    try {
      writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it("defaults to SKIP; write flags false; no mutation", async () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);

    if (!LIVE) {
      const r = await runPhase5MDriverPilotApply({ harnessArmed: false });
      expect(r.summary.overallStatus).toBe("SKIPPED");
      expect(r.summary.productionWrites).toBe(0);
      expect(r.summary.applyAttempted).toBe(false);
      expect(r.summary.pilotWriteProven).toBe(false);
      report = {
        ...r.summary,
        overallStatus: "PENDING_OPERATOR",
        exactExpectedWriteCounts: PHASE_5M_EXPECTED_WRITE_COUNTS,
        exactDomainDiff: { registration_status: "needs_changes" },
        plannedDiffValid: true,
        operatorAuthWritePermissionRequired: false,
        authTriggerExpected: true,
        expectedClaimsChange: false,
        writeOrderDocumented: true,
        blocker:
          "PENDING_OPERATOR — harness not armed; preparation ready; offline Fake PASS in unit tests; no real Pilot this session",
        liveApplyAttempted: false,
      };
      writeSafeReport();
      return;
    }

    // Armed path — construct full Production WRITE env BEFORE loadEnv().
    // Vitest beforeEach resets APP_ENV/EXPECTED_ENVIRONMENT to development;
    // restoring write flags alone is insufficient (first-apply loadEnv failure).
    const tokenBeforeEnv = process.env.FIREBASE_ID_TOKEN?.trim() ?? "";
    applyPhase5MLiveProductionWriteEnvironment({
      capturedGates: OPERATOR_LIVE_GATES,
    });
    expect(process.env.APP_ENV).toBe("production");
    expect(process.env.NODE_ENV).toBe("production");
    expect(process.env.EXPECTED_ENVIRONMENT).toBe("production");
    expect(process.env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe(
      PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES,
    );
    expect(process.env.FIREBASE_ID_TOKEN?.trim() ?? "").toBe(tokenBeforeEnv);
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    assertPhase5MLiveShadowResources(process.env.LIVE_SHADOW_ALLOWED_RESOURCES);
    assertPhase5MLiveProjectFingerprint({
      EXPECTED_PROJECT_ID: process.env.EXPECTED_PROJECT_ID,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    });

    const gateEnv = readPhase5MOperatorGatesFromEnv();
    const token = tokenBeforeEnv || process.env.FIREBASE_ID_TOKEN?.trim() || "";

    // loadEnv from process.env after apply — never a disconnected partial copy.
    const env = loadPhase5MLiveProductionWriteEnv();
    expect(env.APP_ENV).toBe("production");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(true);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(true);
    expect(env.DRIVER_WRITE_ENABLED).toBe(true);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);

    let actor: VerifiedDriverWriteActor | null = null;
    if (token) {
      // Auth factory refuses write flags; actor uses write-disabled env view.
      const auth = await resolveProductionVerifiedActor(
        token,
        envForPhase5MVerifiedActorResolution(env),
      );
      if (auth.ok && auth.identity.role === "super_admin") {
        actor = {
          uid: auth.identity.uid,
          role: auth.identity.role,
          permissions: auth.identity.permissions,
          scope: auth.identity.scope,
        };
      }
    }

    let ports;
    try {
      ports = await createPhase5MProductionApplyPorts({ gates: gateEnv });
    } catch {
      ports = undefined;
    }

    const result = await runPhase5MDriverPilotApply({
      harnessArmed: true,
      gates: gateEnv,
      actor,
      ports,
      executeApply: true,
      liveApplyAttempted: true,
    });
    report = result.summary;

    expect(report.financeWrites).toBe(0);
    expect(report.tripWrites).toBe(0);
    expect(report.agentWrites).toBe(0);
    expect(report.customerWrites).toBe(0);
  });

  it("IAM preflight remains check-only (mutations=0)", async () => {
    const pre = await runPhase5MIamPreflight({
      permissionTester: {
        async testIamPermissions() {
          return ["firebaseauth.users.get", "datastore.entities.get"];
        },
      },
      credentialProvider: {
        name: "HarnessOfflineIamCredential",
        async getCredentials() {
          return {
            projectId: "tutorial-multi-language-70gx4j",
            kind: "fake",
          };
        },
      },
    });
    expect(pre.mutationsPerformed).toBe(0);
    expect(pre.iamChanges).toBe(0);
    expect(pre.mode).toBe("check_only");
    expect(pre.driverWriteAttempted).toBe(false);
    if (!pre.ok) {
      expect(pre.missingPermissions).toEqual(
        expect.arrayContaining([
          "datastore.entities.update",
          "datastore.entities.create",
        ]),
      );
      const plan = planPhase5MTemporaryCustomRole({
        missingPermissions: pre.missingPermissions,
      });
      expect(plan.createRole).toBe(false);
      expect(plan.grantRole).toBe(false);
      expect(plan.includedPermissions).toEqual(
        expect.arrayContaining([
          "datastore.entities.update",
          "datastore.entities.create",
        ]),
      );
    }
    expect(PHASE_5M_REQUIRED_OPERATOR_IAM_PERMISSIONS).toContain(
      "datastore.entities.update",
    );
  });

  it("PHASE5M flag survives sanitization; write flags cleared; live capture restores", () => {
    const captured = captureOperatorHarnessEnv({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "phase5m_test_token_placeholder",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "phase5m_test_token_placeholder",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5M_DRIVER_PILOT_APPLY).toBe("1");
    expect(env.FIREBASE_ID_TOKEN).toBe("phase5m_test_token_placeholder");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }

    // Scoped live contract restores write gates for armed harness only.
    applyPhase5MOperatorLiveEnvironment(
      capturePhase5MOperatorLiveGates({
        PHASE5M_DRIVER_PILOT_APPLY: "1",
        GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
        PRODUCTION_WRITE_ENABLED: "true",
        DRIVER_WRITE_ENABLED: "true",
        EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
        GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
        FIREBASE_ID_TOKEN: "phase5m_test_token_placeholder",
      }),
      env,
    );
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("true");
    expect(env.DRIVER_WRITE_ENABLED).toBe("true");
    expect(env.FINANCE_WRITE_ENABLED).toBe("false");
    expect(env.FIREBASE_ID_TOKEN).toBe("phase5m_test_token_placeholder");
  });
});
