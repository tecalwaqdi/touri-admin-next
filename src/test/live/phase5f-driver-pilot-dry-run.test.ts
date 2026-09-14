// @vitest-environment node
/**
 * Phase 5F — Synthetic target discovery + Production dry-run harness.
 *
 * DEFAULT: SKIP unless PHASE5E_DRIVER_PILOT_DRY_RUN=1 or PHASE5F_DRIVER_PILOT_DRY_RUN=1.
 * Optional live discovery: PHASE5F_LIVE_DISCOVERY=1 (approved Drivers shadow read only).
 *
 * Do NOT execute real Production write. Do NOT enable write flags.
 * Do NOT create synthetic Driver. Do NOT start Finance.
 * Do NOT auto-run live discovery in CI / agents.
 *
 * Operator live discovery + dry-run (local only):
 *   PHASE5F_DRIVER_PILOT_DRY_RUN=1 \
 *     PHASE5F_LIVE_DISCOVERY=1 \
 *     FIREBASE_ID_TOKEN='…' \
 *     PILOT_OPERATOR_IDENTITY='super_admin_uid' \
 *     npx vitest run src/test/live/phase5f-driver-pilot-dry-run.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPhase5FDriverPilotDryRunEnabled,
  isPhase5FLiveDiscoveryEnabled,
} from "@/application/controlled-writes/pilot/isPhase5FDriverPilotDryRunEnabled";
import {
  discoverSyntheticPilotTargetFromShadowDocs,
  PHASE_5F_DISCOVERY_MAX_SCAN,
  summarizeDiscoverySafe,
} from "@/application/controlled-writes/pilot/Phase5FShadowDiscovery";
import {
  PHASE_5F_REQUIRED_WRITE_FLAGS_FALSE,
  runPhase5FDriverPilotDryRun,
} from "@/application/controlled-writes/pilot/Phase5FDriverPilotDryRun";
import {
  AUTH_REQUIRED_FOR_PILOT_TARGET,
  PHASE_5E_EXPECTED_PROJECT_ID,
} from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET } from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";
import { loadEnv, resetEnvCache } from "@/config/env";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { FirebaseAdminFactory } from "@/infrastructure/production/firebase/FirebaseAdminFactory";
import { FirebaseAdminFirestoreReadClient } from "@/infrastructure/production/firestore/FirebaseAdminFirestoreReadClient";
import {
  PHASE_4A5_DRIVER_DISCRIMINATOR_FIELD,
  PHASE_4A5_DRIVERS_MAX_PAGE,
} from "@/infrastructure/production/repositories/FirebaseProductionDriverReadRepository";
import { createProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import {
  resetProductionAuthSingletonsForTests,
  resolveProductionVerifiedActor,
} from "@/infrastructure/auth/productionVerifiedAuth";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";

const DRY_RUN = isPhase5FDriverPilotDryRunEnabled({
  PHASE5F_DRIVER_PILOT_DRY_RUN: process.env.PHASE5F_DRIVER_PILOT_DRY_RUN,
  PHASE5E_DRIVER_PILOT_DRY_RUN: process.env.PHASE5E_DRIVER_PILOT_DRY_RUN,
});
const LIVE_DISCOVERY = isPhase5FLiveDiscoveryEnabled(
  process.env.PHASE5F_LIVE_DISCOVERY,
);
const PROJECT_ID = PHASE_5E_EXPECTED_PROJECT_ID;
const reportDir = join(process.cwd(), ".local", "phase5f-dry-run");
const reportPath = join(reportDir, "dry-run-safe-summary.json");

type SafeLiveReport = {
  overallStatus: "SKIPPED" | "DRY_RUN_PASS" | "DRY_RUN_NO_GO" | "FAIL";
  blocker?: string;
  projectFingerprint?: string;
  targetFound?: boolean;
  targetId?: string | null;
  wouldWrite?: boolean;
  actualWrite?: boolean;
  productionApplyInvocationCount?: number;
  totalProductionWrites?: number;
  allWriteFlagsFalseAfterRun?: boolean;
  liveDiscoveryAttempted: boolean;
  productionWrites: 0;
};

const report: SafeLiveReport = {
  overallStatus: "SKIPPED",
  liveDiscoveryAttempted: false,
  productionWrites: 0,
};

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  writeFileSync(reportPath, serialized);
}

function disableProductionFlags(): void {
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
}

function factoryEnvFrom(env: ReturnType<typeof loadEnv>) {
  return {
    APP_ENV: env.APP_ENV,
    AUTH_MODE: env.AUTH_MODE,
    PRODUCTION_READ_ENABLED: env.PRODUCTION_READ_ENABLED,
    PRODUCTION_READ_MODE: env.PRODUCTION_READ_MODE,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
    AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
    EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
    EXPECTED_ENVIRONMENT: env.EXPECTED_ENVIRONMENT,
  };
}

describe("Phase 5F — Driver Pilot dry-run harness (SKIP / discovery / dry-run)", () => {
  afterAll(() => {
    disableProductionFlags();
    resetEnvCache();
    if (!DRY_RUN) {
      report.overallStatus = "SKIPPED";
      report.blocker =
        "PHASE5F/5E_DRIVER_PILOT_DRY_RUN!=1 — live body not executed";
    }
    try {
      if (DRY_RUN || existsSync(reportDir)) writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it("defaults to SKIP; write flags false; Production unreachable; no planned-id invent", async () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(PHASE_5F_REQUIRED_WRITE_FLAGS_FALSE.DRIVER_WRITE_ENABLED).toBe(
      false,
    );
    expect(PHASE_5F_REQUIRED_WRITE_FLAGS_FALSE.FINANCE_WRITE_ENABLED).toBe(
      false,
    );
    expect(
      ProductionDriverWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
      }),
    ).toBe(false);
    expect(AUTH_REQUIRED_FOR_PILOT_TARGET).toBe(false);
    expect(PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET.startsWith("test_")).toBe(
      true,
    );

    if (!DRY_RUN) {
      expect(LIVE_DISCOVERY).toBe(false);
      report.overallStatus = "SKIPPED";
      return;
    }

    // Operator-controlled dry-run path (writes remain 0).
    let discovery = discoverSyntheticPilotTargetFromShadowDocs([]);

    if (LIVE_DISCOVERY) {
      report.liveDiscoveryAttempted = true;
      resetEnvCache();
      resetProductionAuthSingletonsForTests();
      mkdirSync(reportDir, { recursive: true });
      const obsPath = join(reportDir, "observability.ndjson");
      writeFileSync(obsPath, "", "utf8");

      process.env.PRODUCTION_READ_ENABLED = "true";
      process.env.PRODUCTION_READ_MODE = "shadow";
      process.env.AUTH_MODE = "verified_token";
      process.env.EXPECTED_PROJECT_ID = PROJECT_ID;
      process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "drivers";
      process.env.FULL_PII_SHADOW_ENABLED = "false";
      process.env.PRODUCTION_WRITE_ENABLED = "false";
      process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
      process.env.FINANCE_WRITE_ENABLED = "false";
      process.env.DRIVER_WRITE_ENABLED = "false";
      process.env.AGENT_WRITE_ENABLED = "false";
      process.env.PRODUCTION_READ_OBSERVABILITY_SINK = "file_ndjson";
      process.env.PRODUCTION_READ_OBSERVABILITY_FILE = obsPath;
      resetEnvCache();

      try {
        const env = loadEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          AUTH_MODE: "verified_token",
          PRODUCTION_READ_ENABLED: true,
          PRODUCTION_READ_MODE: "shadow",
          EXPECTED_PROJECT_ID: PROJECT_ID,
          EXPECTED_ENVIRONMENT: "production",
          LIVE_SHADOW_ALLOWED_RESOURCES: "drivers",
          PRODUCTION_READ_OBSERVABILITY_SINK: "file_ndjson",
          PRODUCTION_READ_OBSERVABILITY_FILE: obsPath,
          FULL_PII_SHADOW_ENABLED: false,
          PRODUCTION_WRITE_ENABLED: false,
          GLOBAL_PRODUCTION_WRITE_ENABLED: false,
          FINANCE_WRITE_ENABLED: false,
          DRIVER_WRITE_ENABLED: false,
          AGENT_WRITE_ENABLED: false,
        });
        assertLiveShadowStartupOrThrow(env);

        const observability = createProductionReadObservability({
          sink: "file_ndjson",
          filePath: obsPath,
        });
        const token = process.env.FIREBASE_ID_TOKEN?.trim();
        if (!token) {
          report.overallStatus = "DRY_RUN_NO_GO";
          report.blocker = "FIREBASE_ID_TOKEN missing";
          discovery = discoverSyntheticPilotTargetFromShadowDocs([]);
        } else {
          const auth = await resolveProductionVerifiedActor(
            token,
            env,
            observability,
          );
          if (!auth.ok) {
            report.overallStatus = "DRY_RUN_NO_GO";
            report.blocker = `Auth failed: ${auth.reason}`;
            discovery = discoverSyntheticPilotTargetFromShadowDocs([]);
          } else {
            const factory = FirebaseAdminFactory.getOrCreate({
              env: factoryEnvFrom(env),
              credentialProvider:
                new ApplicationDefaultProductionCredentialProvider(
                  env.EXPECTED_PROJECT_ID,
                ),
              observability,
            });
            const app = await factory.getApp();
            report.projectFingerprint = app.projectId;
            expect(app.projectId).toBe(PROJECT_ID);

            // Bounded Drivers shadow query — same discriminator as Phase 4A-5.
            const client = new FirebaseAdminFirestoreReadClient(factory);
            const page = await client.query({
              collection: "user",
              filters: [
                {
                  field: PHASE_4A5_DRIVER_DISCRIMINATOR_FIELD,
                  op: "==",
                  value: true,
                },
              ],
              orderBy: [{ field: "created_time", direction: "desc" }],
              limit: Math.min(
                PHASE_5F_DISCOVERY_MAX_SCAN,
                PHASE_4A5_DRIVERS_MAX_PAGE,
              ),
            });
            const docs = page.docs
              .filter((d) => d.exists && d.data)
              .map((d) => ({ id: d.id, data: d.data! }));
            discovery = discoverSyntheticPilotTargetFromShadowDocs(docs);
          }
        }
      } finally {
        disableProductionFlags();
        resetEnvCache();
      }
    }

    const safeDiscovery = summarizeDiscoverySafe(discovery);
    report.targetFound = safeDiscovery.targetFound;
    report.targetId = safeDiscovery.targetId;

    // Never invent planned strategy id when discovery empty.
    if (
      !discovery.targetFound &&
      process.env.PILOT_DRIVER_ID === PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET
    ) {
      // Explicitly ignore planned id env unless discovered.
    }

    const result = runPhase5FDriverPilotDryRun({
      projectId: process.env.PILOT_PROJECT_ID?.trim() || PROJECT_ID,
      actorRole: "super_admin",
      operatorIdentity:
        process.env.PILOT_OPERATOR_IDENTITY?.trim() ||
        (LIVE_DISCOVERY ? "" : "op_dry_run"),
      discovery,
      // Never invent a fake live token. Operator supplies PILOT_PRECONDITION_TOKEN
      // after reading the discovered target, or live path captures update_time below.
      preconditionToken: process.env.PILOT_PRECONDITION_TOKEN?.trim() || undefined,
    });

    expect(result.actualWrite).toBe(false);
    expect(result.productionApplyInvocationCount).toBe(0);
    expect(result.writeFlagsRemainFalse).toBe(true);
    expect(result.observability.totalProductionWrites).toBe(0);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);

    report.wouldWrite = result.wouldWrite;
    report.actualWrite = result.actualWrite;
    report.productionApplyInvocationCount =
      result.productionApplyInvocationCount;
    report.totalProductionWrites = result.observability.totalProductionWrites;
    report.allWriteFlagsFalseAfterRun =
      result.observability.allWriteFlagsFalseAfterRun;
    report.overallStatus = result.pilotStatus;

    if (!discovery.targetFound) {
      expect(result.pilotStatus).toBe("DRY_RUN_NO_GO");
      expect(result.observability.denials).toContain(
        "NO_SAFE_SYNTHETIC_DRIVER_EXISTS",
      );
      report.blocker = "NO_SAFE_SYNTHETIC_DRIVER_EXISTS";
    }
  });
});
