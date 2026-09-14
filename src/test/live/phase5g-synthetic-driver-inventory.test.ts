// @vitest-environment node
/**
 * Phase 5G — Existing synthetic Driver inventory (READ-ONLY).
 *
 * DEFAULT: SKIP unless PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY=1.
 * Optional live read: requires operator shadow ADC + FIREBASE_ID_TOKEN etc.
 *
 * Do NOT execute Production write. Do NOT enable write flags.
 * Do NOT create synthetic Driver. Do NOT start Finance.
 * Do NOT auto-run live inventory in CI / agents.
 *
 * Operator live inventory (local only):
 *   PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY=1 \
 *     FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/phase5g-synthetic-driver-inventory.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhase5GLiveSyntheticDriverInventoryEnabled } from "@/application/controlled-writes/pilot/isPhase5GLiveInventoryEnabled";
import {
  PHASE_5G_INVENTORY_MAX_SCAN,
  runPhase5GSyntheticDriverInventory,
} from "@/application/controlled-writes/pilot/Phase5GSyntheticDriverInventory";
import {
  PHASE_5G_REQUIRED_WRITE_FLAGS_FALSE,
  assertPhase5GWriteFlagsFalse,
  summarizePhase5GInventorySafe,
  type Phase5GInventoryObservabilitySummary,
} from "@/application/controlled-writes/pilot/Phase5GInventoryObservability";
import { PHASE_5E_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { loadEnv, resetEnvCache } from "@/config/env";
import { formatProductionAuthBlocker } from "@/infrastructure/auth/productionAuthFailureClassification";
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

const LIVE = isPhase5GLiveSyntheticDriverInventoryEnabled(
  process.env.PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY,
);
const PROJECT_ID = PHASE_5E_EXPECTED_PROJECT_ID;
const reportDir = join(process.cwd(), ".local", "phase5g-inventory");
const reportPath = join(reportDir, "inventory-safe-summary.json");
/** Same Auth network budget as closed Phase 4A live harnesses. */
const PHASE_5G_AUTH_TIMEOUT_MS = 30_000;

type SafeLiveReport = Phase5GInventoryObservabilitySummary & {
  blocker?: string;
  projectFingerprint?: string;
  stateDistribution?: Record<string, number>;
  liveInventoryAttempted: boolean;
};

const report: SafeLiveReport = {
  ...summarizePhase5GInventorySafe(null, {
    productionReadCompleted: false,
    overallOverride: "SKIPPED",
  }),
  liveInventoryAttempted: false,
};

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  writeFileSync(reportPath, serialized);
}

/**
 * Ephemeral live Auth env — SAME contract as closed Phase 4A-1/4A-2 shadow phases.
 * Must run inside `it()` AFTER Vitest global `beforeEach` (src/test/setup.ts),
 * which otherwise clears EXPECTED_PROJECT_ID / APP_ENV / Production Read flags.
 *
 * Critical vs prior Phase 5G false-negative path:
 * - Sets APP_ENV / NEXT_PUBLIC_APP_ENV / GOOGLE_CLOUD_PROJECT / EXPECTED_ENVIRONMENT
 * - Deletes GOOGLE_APPLICATION_CREDENTIALS (ADC impersonation only)
 * - loadEnv() AFTER this must read process.env (not a disconnected copy)
 * - Never clears FIREBASE_ID_TOKEN
 */
export function applyPhase5GLiveAuthEnvironment(
  observabilityFilePath: string,
): void {
  process.env.APP_ENV = "production";
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  process.env.AUTH_MODE = "verified_token";
  process.env.EXPECTED_PROJECT_ID = PROJECT_ID;
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
  process.env.EXPECTED_ENVIRONMENT = "production";
  process.env.PRODUCTION_READ_MODE = "shadow";
  process.env.PRODUCTION_READ_ENABLED = "true";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "drivers";
  process.env.FULL_PII_SHADOW_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.PRODUCTION_READ_OBSERVABILITY_SINK = "file_ndjson";
  process.env.PRODUCTION_READ_OBSERVABILITY_FILE = observabilityFilePath;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

  resetEnvCache();
  resetProductionAuthSingletonsForTests();
}

function disableProductionFlags(): void {
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.FULL_PII_SHADOW_ENABLED = "false";
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

describe("Phase 5G — synthetic Driver inventory harness (SKIP / live read-only)", () => {
  afterAll(() => {
    disableProductionFlags();
    resetEnvCache();
    expect(assertPhase5GWriteFlagsFalse()).toBe(true);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    if (!LIVE) {
      report.overallStatus = "SKIPPED";
      report.blocker =
        "PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY!=1 — live body not executed";
    }
    try {
      if (LIVE || existsSync(reportDir)) writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it(
    "defaults to SKIP; write flags false; no Production mutation",
    async () => {
      expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
      expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
      expect(PHASE_5G_REQUIRED_WRITE_FLAGS_FALSE.DRIVER_WRITE_ENABLED).toBe(
        false,
      );
      expect(PHASE_5G_REQUIRED_WRITE_FLAGS_FALSE.FINANCE_WRITE_ENABLED).toBe(
        false,
      );
      expect(
        ProductionDriverWriteRepository.isReachable({
          GLOBAL_PRODUCTION_WRITE_ENABLED: false,
          DRIVER_WRITE_ENABLED: false,
        }),
      ).toBe(false);
      expect(assertPhase5GWriteFlagsFalse()).toBe(true);

      if (!LIVE) {
        const pending = summarizePhase5GInventorySafe(null, {
          productionReadCompleted: false,
          overallOverride: "PENDING_OPERATOR",
        });
        Object.assign(report, pending, {
          liveInventoryAttempted: false,
          blocker: "PENDING_OPERATOR — live inventory not run",
        });
        expect(report.productionWrites).toBe(0);
        return;
      }

      // Operator-controlled live READ-ONLY path.
      report.liveInventoryAttempted = true;
      mkdirSync(reportDir, { recursive: true });
      const obsPath = join(reportDir, "observability.ndjson");
      writeFileSync(obsPath, "", "utf8");

      // Capture token BEFORE live env mutation (never clear FIREBASE_ID_TOKEN).
      const tokenBeforeEnv = process.env.FIREBASE_ID_TOKEN?.trim() ?? "";

      applyPhase5GLiveAuthEnvironment(obsPath);

      // Prove closed-phase Auth env contract survived setup beforeEach wipe.
      expect(process.env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(PROJECT_ID);
      expect(process.env.APP_ENV).toBe("production");
      expect(process.env.AUTH_MODE).toBe("verified_token");
      expect(process.env.FIREBASE_ID_TOKEN?.trim() ?? "").toBe(tokenBeforeEnv);

      let productionCalls = 0;

      try {
        // Read FROM process.env after apply — same as Phase 4A-1/4A-2 (no disconnected copy).
        const env = loadEnv();
        expect(env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
        expect(env.AUTH_MODE).toBe("verified_token");
        expect(env.APP_ENV).toBe("production");
        expect(env.PRODUCTION_READ_ENABLED).toBe(true);
        expect(env.PRODUCTION_READ_MODE).toBe("shadow");
        expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
        expect(env.DRIVER_WRITE_ENABLED).toBe(false);
        expect(env.FINANCE_WRITE_ENABLED).toBe(false);
        assertLiveShadowStartupOrThrow(env);

        const observability = createProductionReadObservability({
          sink: "file_ndjson",
          filePath: obsPath,
        });

        const token = tokenBeforeEnv || process.env.FIREBASE_ID_TOKEN?.trim() || "";
        if (!token) {
          Object.assign(
            report,
            summarizePhase5GInventorySafe(null, {
              productionReadCompleted: false,
              overallOverride: "FAIL",
            }),
            {
              liveInventoryAttempted: true,
              blocker: formatProductionAuthBlocker("TOKEN_MISSING"),
            },
          );
          return;
        }

        const auth = await resolveProductionVerifiedActor(
          token,
          env,
          observability,
          { timeoutMs: PHASE_5G_AUTH_TIMEOUT_MS },
        );
        productionCalls += 1;
        if (!auth.ok) {
          Object.assign(
            report,
            summarizePhase5GInventorySafe(null, {
              productionReadCompleted: false,
              productionCalls,
              overallOverride: "FAIL",
            }),
            {
              liveInventoryAttempted: true,
              blocker: formatProductionAuthBlocker(auth.reason),
            },
          );
          return;
        }

        const factory = FirebaseAdminFactory.getOrCreate({
          env: factoryEnvFrom(env),
          credentialProvider: new ApplicationDefaultProductionCredentialProvider(
            env.EXPECTED_PROJECT_ID,
          ),
          observability,
        });
        const app = await factory.getApp();
        report.projectFingerprint = app.projectId;
        expect(app.projectId).toBe(PROJECT_ID);

        // Bounded Drivers shadow query — same discriminator as Phase 4A-5 / 5F.
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
          limit: Math.min(PHASE_5G_INVENTORY_MAX_SCAN, PHASE_4A5_DRIVERS_MAX_PAGE),
        });
        productionCalls += 1;

        const docs = page.docs
          .filter((d) => d.exists && d.data)
          .map((d) => ({ id: d.id, data: d.data! }));

        const inventory = runPhase5GSyntheticDriverInventory(docs);
        const obs = summarizePhase5GInventorySafe(inventory, {
          productionReadCompleted: true,
          productionCalls,
        });

        Object.assign(report, obs, {
          liveInventoryAttempted: true,
          stateDistribution: { ...inventory.stateDistribution },
        });

        expect(report.productionWrites).toBe(0);
        expect(report.authWrites).toBe(0);
        expect(report.financeWrites).toBe(0);
        expect(report.tripWrites).toBe(0);
        expect(report.allWriteFlagsFalseAfterRun).toBe(true);
        expect(report.createFixture).toBe(false);
        expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
        expect(
          ProductionDriverWriteRepository.isReachable({
            GLOBAL_PRODUCTION_WRITE_ENABLED: false,
            DRIVER_WRITE_ENABLED: false,
          }),
        ).toBe(false);
      } finally {
        disableProductionFlags();
        resetEnvCache();
        resetProductionAuthSingletonsForTests();
        expect(assertPhase5GWriteFlagsFalse()).toBe(true);
      }
    },
    LIVE ? PHASE_5G_AUTH_TIMEOUT_MS + 15_000 : undefined,
  );

  it("applyPhase5GLiveAuthEnvironment survives global setup wipe before Auth", () => {
    const obsPath = join(reportDir, "env-contract-obs.ndjson");
    mkdirSync(reportDir, { recursive: true });
    // Simulate setup beforeEach wipe then re-apply (closed-phase contract).
    process.env.APP_ENV = "development";
    process.env.EXPECTED_PROJECT_ID = "";
    process.env.GOOGLE_CLOUD_PROJECT = "wrong-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/must-be-deleted.json";
    applyPhase5GLiveAuthEnvironment(obsPath);
    expect(process.env.APP_ENV).toBe("production");
    expect(process.env.NEXT_PUBLIC_APP_ENV).toBe("production");
    expect(process.env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(PROJECT_ID);
    expect(process.env.AUTH_MODE).toBe("verified_token");
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    const env = loadEnv();
    expect(env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.APP_ENV).toBe("production");
    disableProductionFlags();
    resetEnvCache();
    resetProductionAuthSingletonsForTests();
  });
});
