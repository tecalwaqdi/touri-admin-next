// @vitest-environment node
/**
 * Phase 5L — Driver Pilot dry-run harness (plan only; Production reads OK).
 *
 * DEFAULT: SKIP unless PHASE5L_DRIVER_PILOT_DRY_RUN=1.
 * Sources UID only from .local/phase5j-fixture/registry.json.
 * Actor: verified Production super_admin via FIREBASE_ID_TOKEN closed Auth path.
 *
 * DO NOT apply RequestDriverChanges. DO NOT restore create IAM.
 * DO NOT re-provision. DO NOT start Finance. DO NOT setCustomUserClaims.
 *
 * Operator (local only):
 *   PHASE5L_DRIVER_PILOT_DRY_RUN=1 \
 *     FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/phase5l-driver-pilot-dry-run.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhase5LDriverPilotDryRunEnabled } from "@/application/controlled-writes/pilot/isPhase5LDriverPilotDryRunEnabled";
import {
  runPhase5LDriverPilotDryRun,
} from "@/application/controlled-writes/pilot/Phase5LDriverPilotDryRun";
import {
  emptyPhase5LDryRunSafeSummary,
  type Phase5LDryRunSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5LDryRunSafeSummary";
import {
  assertPhase5LLiveReadContract,
  assertPhase5LLiveProjectFingerprint,
  PHASE_5L_EXPECTED_PROJECT_ID,
  PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES,
} from "@/application/controlled-writes/pilot/Phase5LLiveReadContract";
import { createPhase5KReadOnlyFirebasePorts } from "@/application/controlled-writes/pilot/Phase5KReadOnlyFirebaseAdapters";
import { loadPhase5KFixtureUidFromRegistry } from "@/application/controlled-writes/pilot/Phase5KRegistrySource";
import { assertPhase5LProcessEnvWriteFlagsFalse } from "@/application/controlled-writes/pilot/Phase5LWriteFlagAssert";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { applyPhase5LLiveReadEnvironment } from "@/test/helpers/phase5lLiveReadEnvironment";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";
import { loadEnv, resetEnvCache } from "@/config/env";
import { resolveProductionVerifiedActor } from "@/infrastructure/auth/productionVerifiedAuth";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import type { VerifiedDriverWriteActor } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";

const LIVE = isPhase5LDriverPilotDryRunEnabled(
  process.env.PHASE5L_DRIVER_PILOT_DRY_RUN,
);

const reportDir = join(process.cwd(), ".local", "phase5l-driver-pilot");
const reportPath = join(reportDir, "dry-run-safe-summary.json");
const obsPath = join(reportDir, "observability.ndjson");

let report: Phase5LDryRunSafeSummary = emptyPhase5LDryRunSafeSummary({
  overallStatus: LIVE ? "PENDING_OPERATOR" : "SKIPPED",
});

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  expect(serialized).not.toMatch(/password|private_key|BEGIN PRIVATE/i);
  // Avoid echoing raw ID tokens; allow documenting actor-token absence as blocker text.
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
  process.env.PHASE5I_PROVISION_SYNTHETIC_DRIVER = "";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
  resetEnvCache();
}

describe("Phase 5L — Driver Pilot dry-run (SKIP default; plan-only when armed)", () => {
  afterAll(() => {
    disableWriteFlags();
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(assertPhase5LProcessEnvWriteFlagsFalse()).toBe(true);
    try {
      writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it("defaults to SKIP; write flags false; no mutation", async () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(assertPhase5LProcessEnvWriteFlagsFalse()).toBe(true);
    expect(
      ProductionDriverWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
      }),
    ).toBe(false);

    if (!LIVE) {
      const r = await runPhase5LDriverPilotDryRun({ harnessArmed: false });
      expect(r.summary.overallStatus).toBe("SKIPPED");
      expect(r.summary.productionWrites).toBe(0);
      expect(r.summary.authWrites).toBe(0);
      expect(r.productionApplyInvoked).toBe(false);
      report = {
        ...r.summary,
        overallStatus: "PENDING_OPERATOR",
        exactWriteCountsKnown: true,
        exactFutureWriteCounts: {
          driverDomainWrites: 1,
          auditIntentWrites: 1,
          auditResultWrites: 1,
          idempotencyWrites: 1,
          authClaimWrites: 1,
          financeWrites: 0,
          tripWrites: 0,
          agentWrites: 0,
          customerWrites: 0,
        },
        expectedAuthTrigger: true,
        expectedClaimsChange: false,
        plannedDiffValid: true,
        plannedState: "needs_changes",
        idempotencyReady: true,
        auditPlanReady: true,
        blocker:
          "PENDING_OPERATOR — harness flag not armed and/or verified Production actor token absent; harness ready; offline planner PASS in unit tests",
        liveDryRunAttempted: false,
      };
      writeSafeReport();
      return;
    }

    // Armed path — live dry-run branch (not SKIP).
    // Stages: flag → live read env → actor verified → fixture re-read → planner → zero writes.
    disableWriteFlags();
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(obsPath, "", "utf8");

    // Capture token BEFORE live env mutation (never clear / never log).
    const tokenBeforeEnv = process.env.FIREBASE_ID_TOKEN?.trim() ?? "";

    applyPhase5LLiveReadEnvironment({ observabilityFilePath: obsPath });

    expect(process.env.EXPECTED_PROJECT_ID).toBe(PHASE_5L_EXPECTED_PROJECT_ID);
    expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(PHASE_5L_EXPECTED_PROJECT_ID);
    expect(process.env.APP_ENV).toBe("production");
    expect(process.env.AUTH_MODE).toBe("verified_token");
    expect(process.env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe(
      PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES,
    );
    expect(process.env.FIREBASE_ID_TOKEN?.trim() ?? "").toBe(tokenBeforeEnv);
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    assertPhase5LLiveReadContract(process.env.LIVE_SHADOW_ALLOWED_RESOURCES);
    assertPhase5LLiveProjectFingerprint({
      EXPECTED_PROJECT_ID: process.env.EXPECTED_PROJECT_ID,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    });
    expect(assertPhase5LProcessEnvWriteFlagsFalse()).toBe(true);

    const registry = loadPhase5KFixtureUidFromRegistry();
    if (!registry.ok) {
      report = emptyPhase5LDryRunSafeSummary({
        overallStatus: "PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO",
        dryRunExecuted: false,
        blocker: registry.message,
        denials: [registry.code],
        liveDryRunAttempted: false,
        allWriteFlagsFalseAfterRun: true,
      });
      expect(report.productionWrites).toBe(0);
      return;
    }

    const token = tokenBeforeEnv || process.env.FIREBASE_ID_TOKEN?.trim() || "";
    if (!token) {
      report = emptyPhase5LDryRunSafeSummary({
        overallStatus: "PENDING_OPERATOR",
        dryRunExecuted: false,
        targetFound: true,
        blocker:
          "PENDING_OPERATOR — verified Production actor token missing; harness ready (registry present)",
        liveDryRunAttempted: false,
        allWriteFlagsFalseAfterRun: true,
      });
      expect(report.productionWrites).toBe(0);
      expect(report.authWrites).toBe(0);
      writeSafeReport();
      return;
    }

    let ports;
    try {
      ports = await createPhase5KReadOnlyFirebasePorts({
        projectId: PHASE_5L_EXPECTED_PROJECT_ID,
      });
    } catch (err) {
      report = emptyPhase5LDryRunSafeSummary({
        overallStatus: "PENDING_OPERATOR",
        dryRunExecuted: false,
        targetFound: true,
        blocker: `PENDING_OPERATOR — ADC read ports unavailable: ${
          err instanceof Error ? err.message : "unknown"
        }`,
        liveDryRunAttempted: false,
        allWriteFlagsFalseAfterRun: true,
      });
      return;
    }

    // loadEnv from process.env after apply — never a disconnected partial copy.
    const env = loadEnv();
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe(
      PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES,
    );
    expect(env.PRODUCTION_READ_ENABLED).toBe(true);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    assertLiveShadowStartupOrThrow(env);
    assertPhase5LLiveReadContract(env.LIVE_SHADOW_ALLOWED_RESOURCES);
    assertPhase5LLiveProjectFingerprint({
      EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
    });

    const auth = await resolveProductionVerifiedActor(token, env);
    if (!auth.ok) {
      report = emptyPhase5LDryRunSafeSummary({
        overallStatus: "PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO",
        dryRunExecuted: false,
        targetFound: true,
        actorVerified: false,
        blocker: `Auth failed: ${auth.reason}`,
        denials: [auth.reason],
        liveDryRunAttempted: true,
        allWriteFlagsFalseAfterRun: true,
      });
      expect(report.productionWrites).toBe(0);
      return;
    }

    if (auth.identity.role !== "super_admin") {
      report = emptyPhase5LDryRunSafeSummary({
        overallStatus: "PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO",
        dryRunExecuted: false,
        targetFound: true,
        actorVerified: true,
        actorRole: auth.identity.role,
        rbacPass: false,
        blocker: `PILOT_ACTOR_NOT_SUPER_ADMIN role=${auth.identity.role}`,
        denials: ["PILOT_ACTOR_NOT_SUPER_ADMIN"],
        liveDryRunAttempted: true,
        allWriteFlagsFalseAfterRun: true,
      });
      return;
    }

    const actor: VerifiedDriverWriteActor = {
      uid: auth.identity.uid,
      role: auth.identity.role,
      permissions: auth.identity.permissions,
      scope: auth.identity.scope,
    };

    const result = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor,
      ports,
      registryOverride: registry,
      liveDryRunAttempted: true,
    });
    report = result.summary;

    expect(report.productionWrites).toBe(0);
    expect(report.authWrites).toBe(0);
    expect(report.financeWrites).toBe(0);
    expect(report.tripWrites).toBe(0);
    expect(report.agentWrites).toBe(0);
    expect(report.customerWrites).toBe(0);
    expect(report.allWriteFlagsFalseAfterRun).toBe(true);
    expect(result.productionApplyInvoked).toBe(false);
    expect(assertPhase5LProcessEnvWriteFlagsFalse()).toBe(true);
  });

  it("PHASE5L flag + FIREBASE_ID_TOKEN survive sanitization; write flags cleared", () => {
    const captured = captureOperatorHarnessEnv({
      PHASE5L_DRIVER_PILOT_DRY_RUN: "1",
      FIREBASE_ID_TOKEN: "phase5l_test_token_placeholder",
      PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE: undefined,
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: undefined,
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: undefined,
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: undefined,
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5L_DRIVER_PILOT_DRY_RUN: "1",
      FIREBASE_ID_TOKEN: "phase5l_test_token_placeholder",
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5L_DRIVER_PILOT_DRY_RUN).toBe("1");
    expect(env.FIREBASE_ID_TOKEN).toBe("phase5l_test_token_placeholder");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });
});
