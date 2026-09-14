// @vitest-environment node
/**
 * Phase 5K — READ-ONLY provisioned fixture verification harness.
 *
 * DEFAULT: SKIP unless PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE=1.
 * ADC read-only OK. Must NOT need create IAM.
 * Sources UID only from .local/phase5j-fixture/registry.json.
 *
 * DO NOT provision. DO NOT restore create IAM. DO NOT apply RequestDriverChanges.
 * DO NOT start Finance. DO NOT print UID broadly.
 *
 * Operator (local only):
 *   PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE=1 \
 *     npx vitest run src/test/live/phase5k-verify-provisioned-driver-fixture.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhase5KVerifyProvisionedDriverFixtureEnabled } from "@/application/controlled-writes/pilot/isPhase5KVerifyProvisionedDriverFixtureEnabled";
import { runPhase5KVerifyProvisionedFixture } from "@/application/controlled-writes/pilot/Phase5KVerifyProvisionedFixture";
import {
  emptyPhase5KVerificationSafeSummary,
  type Phase5KVerificationSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5KVerificationSafeSummary";
import { createPhase5KReadOnlyFirebasePorts } from "@/application/controlled-writes/pilot/Phase5KReadOnlyFirebaseAdapters";
import { loadPhase5KFixtureUidFromRegistry } from "@/application/controlled-writes/pilot/Phase5KRegistrySource";
import { assertPhase5KProcessEnvWriteFlagsFalse } from "@/application/controlled-writes/pilot/Phase5KWriteFlagAssert";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";
import { resetEnvCache } from "@/config/env";
import { PHASE_5I_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";

const LIVE = isPhase5KVerifyProvisionedDriverFixtureEnabled(
  process.env.PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE,
);

const reportDir = join(
  process.cwd(),
  ".local",
  "phase5k-fixture-verification",
);
const reportPath = join(reportDir, "verification-safe-summary.json");

let report: Phase5KVerificationSafeSummary = emptyPhase5KVerificationSafeSummary(
  {
    overallStatus: LIVE ? "PENDING_OPERATOR" : "SKIPPED",
  },
);

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  expect(serialized).not.toMatch(/password|private_key|BEGIN PRIVATE|id_token/i);
  // UID must not appear broadly — refuse uid field dumps in the safe summary.
  expect(serialized).not.toMatch(/"uid"\s*:/);
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
  resetEnvCache();
}

describe("Phase 5K — verify provisioned fixture (SKIP default; read-only when armed)", () => {
  afterAll(() => {
    disableWriteFlags();
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(assertPhase5KProcessEnvWriteFlagsFalse()).toBe(true);
    try {
      if (LIVE || existsSync(reportDir) || report.liveVerificationAttempted) {
        writeSafeReport();
      }
    } catch {
      /* ignore */
    }
  });

  it("defaults to SKIP; write flags false; no mutation", async () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(assertPhase5KProcessEnvWriteFlagsFalse()).toBe(true);

    if (!LIVE) {
      const r = await runPhase5KVerifyProvisionedFixture({
        harnessArmed: false,
      });
      expect(r.summary.overallStatus).toBe("SKIPPED");
      expect(r.summary.productionWrites).toBe(0);
      expect(r.summary.authWrites).toBe(0);
      expect(r.summary.pilotDryRunEligible).toBe(false);
      report = {
        ...r.summary,
        overallStatus: "PENDING_OPERATOR",
        blocker:
          "PENDING_OPERATOR — PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE!=1; live body not executed",
        liveVerificationAttempted: false,
      };
      return;
    }

    // Armed read-only path.
    disableWriteFlags();
    process.env.EXPECTED_PROJECT_ID = PHASE_5I_EXPECTED_PROJECT_ID;
    process.env.GOOGLE_CLOUD_PROJECT = PHASE_5I_EXPECTED_PROJECT_ID;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    resetEnvCache();

    const registry = loadPhase5KFixtureUidFromRegistry();
    if (!registry.ok) {
      report = emptyPhase5KVerificationSafeSummary({
        overallStatus: "PHASE5K_FIXTURE_VERIFICATION_FAILED",
        blocker: registry.message,
        denials: [registry.code],
        liveVerificationAttempted: false,
        allWriteFlagsFalseAfterRun: true,
      });
      expect(report.productionWrites).toBe(0);
      return;
    }

    let ports;
    try {
      ports = await createPhase5KReadOnlyFirebasePorts({
        projectId: PHASE_5I_EXPECTED_PROJECT_ID,
      });
    } catch (err) {
      report = emptyPhase5KVerificationSafeSummary({
        overallStatus: "PENDING_OPERATOR",
        fixtureFound: true,
        logicalFixtureNameMatch: true,
        provisioningStatusMatch: true,
        registryStatus: registry.status,
        blocker: `PENDING_OPERATOR — ADC read ports unavailable: ${
          err instanceof Error ? err.message : "unknown"
        }`,
        liveVerificationAttempted: false,
        allWriteFlagsFalseAfterRun: true,
        phase5jClaimVerificationNote: (
          await runPhase5KVerifyProvisionedFixture({ harnessArmed: false })
        ).phase5jClaimNote,
      });
      return;
    }

    const result = await runPhase5KVerifyProvisionedFixture({
      harnessArmed: true,
      ports,
      registryOverride: registry,
    });
    report = result.summary;

    expect(report.productionWrites).toBe(0);
    expect(report.authWrites).toBe(0);
    expect(report.financeWrites).toBe(0);
    expect(report.tripWrites).toBe(0);
    expect(report.allWriteFlagsFalseAfterRun).toBe(true);
    expect(assertPhase5KProcessEnvWriteFlagsFalse()).toBe(true);

    if (report.overallStatus === "PHASE5K_FIXTURE_VERIFIED") {
      expect(report.pilotDryRunEligible).toBe(true);
      expect(report.claimVerificationReadCount).toBeGreaterThanOrEqual(1);
    } else {
      expect(report.pilotDryRunEligible).toBe(false);
    }
  });

  it("PHASE5K flag survives sanitization; write flags cleared", () => {
    const captured = captureOperatorHarnessEnv({
      PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE: "1",
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: undefined,
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: undefined,
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: undefined,
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE: "1",
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });
});
