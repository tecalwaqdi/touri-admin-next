/**
 * Phase 5I — dry-run harness regressions (offline):
 * operator flag preservation, gate exact-1, summary writer, no PII/secrets.
 * Production / Auth / Firestore writes = 0.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPhase5ISyntheticDriverProvisionDryRun } from "@/application/controlled-writes/pilot/Phase5IProvisionDryRun";
import {
  assertPhase5IWriteFlagsFalse,
  summarizePhase5IProvisionDryRunSafe,
  toPhase5IDryRunObservabilityEvent,
} from "@/application/controlled-writes/pilot/Phase5IProvisionDryRunObservability";
import {
  isPhase5ISyntheticDriverProvisionDryRunEnabled,
} from "@/application/controlled-writes/pilot/isPhase5ISyntheticDriverProvisionEnabled";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
  OPERATOR_HARNESS_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";

describe("Phase 5I — dry-run gate exact-1", () => {
  it("flag absent → SKIP (dry-run disabled)", () => {
    expect(isPhase5ISyntheticDriverProvisionDryRunEnabled(undefined)).toBe(
      false,
    );
    expect(isPhase5ISyntheticDriverProvisionDryRunEnabled("")).toBe(false);
  });

  it("flag 0 → SKIP", () => {
    expect(isPhase5ISyntheticDriverProvisionDryRunEnabled("0")).toBe(false);
    expect(isPhase5ISyntheticDriverProvisionDryRunEnabled("true")).toBe(false);
  });

  it("flag 1 → dry-run executes (offline plan)", () => {
    expect(isPhase5ISyntheticDriverProvisionDryRunEnabled("1")).toBe(true);
    const r = runPhase5ISyntheticDriverProvisionDryRun({ dryRunEnv: "1" });
    expect(r.mode).toBe("dry_run");
    expect(r.actualWrite).toBe(false);
    expect(r.wouldWrite).toBe(false);
    expect(r.productionWrites).toBe(0);
    expect(r.authWrites).toBe(0);
    const summary = summarizePhase5IProvisionDryRunSafe(r, {
      dryRunExecuted: true,
    });
    expect(summary.dryRunExecuted).toBe(true);
    expect(summary.overallStatus).toBe("DRY_RUN_PASS");
  });
});

describe("Phase 5I — operator harness env preservation", () => {
  it("preserves ONLY approved dry-run / 5G / 5J harness keys; never write arms", () => {
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN",
    );
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY",
    );
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5J_PROVISION_SYNTHETIC_DRIVER",
    );
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE",
    );
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5L_DRIVER_PILOT_DRY_RUN",
    );
    expect(OPERATOR_HARNESS_NEVER_PRESERVE_KEYS).toEqual(
      expect.arrayContaining([
        "PHASE5I_PROVISION_SYNTHETIC_DRIVER",
        "SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED",
        "GLOBAL_PRODUCTION_WRITE_ENABLED",
        "PRODUCTION_WRITE_ENABLED",
        "DRIVER_WRITE_ENABLED",
      ]),
    );

    const captured = captureOperatorHarnessEnv({
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: "1",
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: "1",
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: "1",
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });

    expect(captured.PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN).toBe("1");
    expect(captured.PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY).toBe("1");
    expect(captured.PHASE5J_PROVISION_SYNTHETIC_DRIVER).toBe("1");

    const env: Record<string, string | undefined> = {
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: "1",
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: "1",
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: "1",
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };
    env.PRODUCTION_WRITE_ENABLED = "false";
    env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
    env.DRIVER_WRITE_ENABLED = "false";

    applyOperatorHarnessEnvSanitization(captured, env);

    expect(env.PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN).toBe("1");
    expect(env.PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY).toBe("1");
    expect(env.PHASE5J_PROVISION_SYNTHETIC_DRIVER).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });
});

describe("Phase 5I — dry-run summary writer (safe fields only)", () => {
  it("writes dry-run-safe-summary.json + observability.ndjson without secrets/PII", () => {
    const dir = join(
      process.cwd(),
      ".local",
      "phase5i-provision-dry-run-unit",
    );
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const result = runPhase5ISyntheticDriverProvisionDryRun({ dryRunEnv: "1" });
    const summary = summarizePhase5IProvisionDryRunSafe(result, {
      dryRunExecuted: true,
    });
    expect(summary.overallStatus).toBe("DRY_RUN_PASS");
    expect(summary.dryRunExecuted).toBe(true);
    expect(summary.authFixtureStrategyValid).toBe(true);
    expect(summary.expectedClaimsSafe).toBe(true);
    expect(summary.elevatedPrivilege).toBe(false);
    expect(summary.actualAuthWrites).toBe(0);
    expect(summary.actualFirestoreWrites).toBe(0);
    expect(summary.productionWrites).toBe(0);
    expect(summary.financeWrites).toBe(0);
    expect(summary.tripWrites).toBe(0);
    expect(summary.authCreateInvocationCount).toBe(0);
    expect(summary.firestoreCreateInvocationCount).toBe(0);
    expect(summary.setCustomUserClaimsInvocationCount).toBe(0);
    expect(assertPhase5IWriteFlagsFalse()).toBe(true);

    const reportPath = join(dir, "dry-run-safe-summary.json");
    const obsPath = join(dir, "observability.ndjson");
    const serialized = JSON.stringify(summary, null, 2);
    const obsLine = JSON.stringify(toPhase5IDryRunObservabilityEvent(summary));
    expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
    expect(driverLiveReportHasSensitiveLeak(obsLine)).toBe(false);
    expect(serialized).not.toMatch(/password|token|@|phone|\+966/i);
    expect(obsLine).not.toMatch(/password|token|Bearer|eyJ/i);

    writeFileSync(reportPath, serialized);
    writeFileSync(obsPath, `${obsLine}\n`);
    expect(existsSync(reportPath)).toBe(true);
    expect(existsSync(obsPath)).toBe(true);
    const roundTrip = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(roundTrip.overallStatus).toBe("DRY_RUN_PASS");
    expect(roundTrip.dryRunExecuted).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });
});
