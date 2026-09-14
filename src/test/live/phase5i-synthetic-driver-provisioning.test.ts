// @vitest-environment node
/**
 * Phase 5I — Auth-safe synthetic Driver provisioning harness (DESIGN).
 *
 * DEFAULT: SKIP unless:
 *   PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN=1  → offline plan-only dry-run
 *   PHASE5I_PROVISION_SYNTHETIC_DRIVER=1          → provision arm (still refused)
 *
 * Gates are resolved INSIDE each test body AFTER Vitest global setup sanitization
 * restores the approved dry-run flag (Phase 5G operator-harness preservation).
 * Do NOT treat module-scope env snapshots as authoritative.
 *
 * Do NOT run live provision against Production.
 * Do NOT enable SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED.
 * Do NOT enable write flags. Do NOT start Pilot / Finance.
 * OFFLINE PLAN-ONLY — no FIREBASE_ID_TOKEN / ADC / Production read required.
 *
 * Operator offline dry-run:
 *   PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN=1 \
 *     npx vitest run src/test/live/phase5i-synthetic-driver-provisioning.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPhase5IProvisionSyntheticDriverEnabled,
  isPhase5ISyntheticDriverProvisionDryRunEnabled,
  isSyntheticAuthFixtureWriteEnabled,
  PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED,
} from "@/application/controlled-writes/pilot/isPhase5ISyntheticDriverProvisionEnabled";
import { runPhase5ISyntheticDriverProvisionDryRun } from "@/application/controlled-writes/pilot/Phase5IProvisionDryRun";
import {
  assertPhase5IWriteFlagsFalse,
  summarizePhase5IProvisionDryRunSafe,
  toPhase5IDryRunObservabilityEvent,
  type Phase5IProvisionDryRunSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5IProvisionDryRunObservability";
import {
  createSyntheticDriverProvisioningService,
} from "@/application/controlled-writes/pilot/SyntheticDriverProvisioningService";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION } from "@/application/controlled-writes/pilot/Phase5IExpectedWriteCounts";
import { PHASE_5I_LOGICAL_FIXTURE_NAME } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";

const reportDir = join(process.cwd(), ".local", "phase5i-provision-dry-run");
const reportPath = join(reportDir, "dry-run-safe-summary.json");
const observabilityPath = join(reportDir, "observability.ndjson");

let report: Phase5IProvisionDryRunSafeSummary =
  summarizePhase5IProvisionDryRunSafe(null, {
    overallOverride: "SKIPPED",
  });

function writeSafeArtifacts(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  writeFileSync(reportPath, serialized);
  const obsLine = JSON.stringify(toPhase5IDryRunObservabilityEvent(report));
  expect(driverLiveReportHasSensitiveLeak(obsLine)).toBe(false);
  writeFileSync(observabilityPath, `${obsLine}\n`);
}

function resolveGatesAfterSetup() {
  return {
    dryRun: isPhase5ISyntheticDriverProvisionDryRunEnabled(
      process.env.PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN,
    ),
    provision: isPhase5IProvisionSyntheticDriverEnabled(
      process.env.PHASE5I_PROVISION_SYNTHETIC_DRIVER,
    ),
    authWrite: isSyntheticAuthFixtureWriteEnabled(
      process.env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
    ),
  };
}

describe("Phase 5I — Synthetic Driver provisioning harness (SKIP / dry-run)", () => {
  afterAll(() => {
    expect(assertPhase5IWriteFlagsFalse()).toBe(true);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    try {
      if (report.dryRunExecuted || existsSync(reportDir)) {
        writeSafeArtifacts();
      }
    } catch {
      /* ignore */
    }
  });

  it("default/no flag → safely skips provisioning", async () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(
      PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
    ).toBe(false);
    expect(PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION.authCreate).toBe(0);
    expect(assertPhase5IWriteFlagsFalse()).toBe(true);

    const { dryRun, provision, authWrite } = resolveGatesAfterSetup();
    expect(authWrite).toBe(false);

    if (dryRun) {
      // Covered by dry-run test when operator flag present.
      return;
    }

    expect(dryRun).toBe(false);
    const svc = createSyntheticDriverProvisioningService();
    const r = await svc.provision({
      provisionEnv: process.env.PHASE5I_PROVISION_SYNTHETIC_DRIVER,
    });
    expect(r.ok).toBe(false);
    expect(r.actualWrite).toBe(false);
    if (!r.ok) expect(r.code).toBe("PHASE5I_PROVISION_SKIP");
    expect(provision).toBe(false);

    report = summarizePhase5IProvisionDryRunSafe(null, {
      overallOverride: "SKIPPED",
      blocker:
        "PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN!=1 — dry-run body not executed",
    });
    expect(report.dryRunExecuted).toBe(false);
    expect(report.productionWrites).toBe(0);
    expect(report.actualAuthWrites).toBe(0);
  });

  it("dry-run flag → executes Phase 5I plan-only dry-run", () => {
    const { dryRun } = resolveGatesAfterSetup();

    if (!dryRun) {
      expect(dryRun).toBe(false);
      return;
    }

    mkdirSync(reportDir, { recursive: true });
    writeFileSync(observabilityPath, "", "utf8");

    const result = runPhase5ISyntheticDriverProvisionDryRun({
      dryRunEnv: "1",
      provisionEnv: process.env.PHASE5I_PROVISION_SYNTHETIC_DRIVER,
      authFixtureWriteEnv: process.env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
    });

    // Design-session lock: wouldWrite stays false (gates documented false).
    expect(result.actualWrite).toBe(false);
    expect(result.wouldWrite).toBe(false);
    expect(result.productionWrites).toBe(0);
    expect(result.authWrites).toBe(0);
    expect(result.financeWrites).toBe(0);
    expect(result.tripWrites).toBe(0);
    expect(result.writeFlagsRemainFalse).toBe(true);
    expect(result.elevatedVerdict).toBe("AUTH_SAFE_FIXTURE_GO");
    expect(result.logicalName).toBe(PHASE_5I_LOGICAL_FIXTURE_NAME);
    expect(result.membership.safePilotEligible).toBe(true);
    expect(result.writeCounts.authCreate).toBe(0);
    expect(result.writeCounts.firestoreUserCreates).toBe(0);
    expect(result.writeCounts.claimsSetCustomUserClaims).toBe(0);

    report = summarizePhase5IProvisionDryRunSafe(result, {
      dryRunExecuted: true,
    });
    expect(report.dryRunExecuted).toBe(true);
    expect(report.overallStatus).toBe("DRY_RUN_PASS");
    expect(report.actualWrite).toBe(false);
    expect(report.productionWrites).toBe(0);
    expect(report.actualAuthWrites).toBe(0);
    expect(report.authCreateInvocationCount).toBe(0);
    expect(report.firestoreCreateInvocationCount).toBe(0);
    expect(report.setCustomUserClaimsInvocationCount).toBe(0);
    expect(report.allWriteFlagsFalseAfterRun).toBe(true);
    // Design-session: planning valid but provisioningWouldBePossible=false.
    expect(report.provisioningWouldBePossible).toBe(false);
    expect(report.wouldCreateAuth).toBe(false);
    expect(report.wouldCreateFirestoreFixture).toBe(false);

    writeSafeArtifacts();
    expect(existsSync(reportPath)).toBe(true);
    expect(existsSync(observabilityPath)).toBe(true);
  });

  it("provision flag → remains gated (PROVISIONING_WRITE_DISABLED)", async () => {
    // Even if provision + auth-write arms are passed explicitly, refuse without
    // GLOBAL/PRODUCTION/DRIVER write gates + ports (Phase 5J).
    const svc = createSyntheticDriverProvisioningService();
    const created = await svc.provision({
      provisionEnv: "1",
      authFixtureWriteEnv: "1",
    });
    expect(created.ok).toBe(false);
    expect(created.actualWrite).toBe(false);
    if (!created.ok) {
      expect(created.code).toBe("PROVISIONING_WRITE_DISABLED");
      expect(created.authWrites).toBe(0);
      expect(created.productionWrites).toBe(0);
    }
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(assertPhase5IWriteFlagsFalse()).toBe(true);
    expect(
      PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
    ).toBe(false);
  });

  it("operator dry-run flag survives global setup sanitization", () => {
    // Simulate shell capture → write-flag wipe → never-preserve clear → restore.
    const captured = captureOperatorHarnessEnv({
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: "1",
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: undefined,
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: undefined,
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });

    const env: Record<string, string | undefined> = {
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: "1",
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };

    // Global setup forces write flags false (same as src/test/setup.ts).
    env.PRODUCTION_WRITE_ENABLED = "false";
    env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
    env.DRIVER_WRITE_ENABLED = "false";

    applyOperatorHarnessEnvSanitization(captured, env);

    expect(env.PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
    expect(
      isPhase5ISyntheticDriverProvisionDryRunEnabled(
        env.PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN,
      ),
    ).toBe(true);
    expect(
      isPhase5IProvisionSyntheticDriverEnabled(
        env.PHASE5I_PROVISION_SYNTHETIC_DRIVER,
      ),
    ).toBe(false);
    expect(
      isSyntheticAuthFixtureWriteEnabled(
        env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
      ),
    ).toBe(false);

    // Live process.env after real beforeEach: dry-run restored from shell capture.
    const { dryRun, provision, authWrite } = resolveGatesAfterSetup();
    expect(authWrite).toBe(false);
    expect(provision).toBe(false);
    if (process.env.PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN === "1") {
      expect(dryRun).toBe(true);
    } else {
      expect(dryRun).toBe(false);
    }
  });
});
