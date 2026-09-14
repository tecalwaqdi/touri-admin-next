// @vitest-environment node
/**
 * Phase 4A-5 controlled live drivers-only shadow read harness.
 * Ephemeral env only — never commits Production Read enablement.
 *
 * Run (drivers — operator only; do NOT auto-enable in CI / agents):
 *   PHASE4A5_LIVE_DRIVERS=1 FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/phase4a5-live-drivers.shadow.test.ts
 *
 * DEFAULT: live `it` body returns early unless PHASE4A5_LIVE_DRIVERS=1.
 * DO NOT execute the live path in readiness agents/CI.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "@/config/env";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { FirebaseAdminFactory } from "@/infrastructure/production/firebase/FirebaseAdminFactory";
import { FirebaseAdminFirestoreReadClient } from "@/infrastructure/production/firestore/FirebaseAdminFirestoreReadClient";
import {
  FirebaseProductionDriverReadRepository,
  PHASE_4A5_DRIVERS_MAX_PAGE,
} from "@/infrastructure/production/repositories/FirebaseProductionDriverReadRepository";
import { createProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import { parseLiveShadowAllowedResources } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import {
  resetProductionAuthSingletonsForTests,
  resolveProductionVerifiedActor,
} from "@/infrastructure/auth/productionVerifiedAuth";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { createRequestId, createCorrelationId } from "@/lib/ids";
import {
  driverMappingReadyForLiveClose,
  reconcileDriverAuditPartition,
} from "@/domain/driver/DriverDuplicateIdentityAudit";
import {
  driverLiveClosingGatesPass,
  driverLiveReportHasSensitiveLeak,
  excludedNonDriverHasAuthoritativeEvidence,
  formatDriverMappingNoGoMessage,
  type DriverMappingDiagnostic,
} from "@/domain/driver/DriverMappingDiagnostic";
import { isPhase4A5LiveDriversEnabled } from "@/domain/driver/isPhase4A5LiveDriversEnabled";
import { createShadowReadContainer } from "@/infrastructure/production/container/createContainers";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";

const LIVE_DRIVERS = isPhase4A5LiveDriversEnabled(
  process.env.PHASE4A5_LIVE_DRIVERS,
);
const PROJECT_ID = "tutorial-multi-language-70gx4j";
const SHADOW_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com";
const LIVE_TIMEOUT_MS = 30_000;

const reportDir = join(process.cwd(), ".local", "phase4a5-live");
const obsPath = join(reportDir, "observability.ndjson");
const reportPath = join(reportDir, "live-safe-summary.json");

type LiveSafeReport = {
  overallStatus: "PASS" | "NO_GO" | "FAIL" | "SKIPPED";
  blocker?: string;
  projectFingerprint?: string;
  shadowIdentity: string;
  authResult?: string;
  queryLimit: number;
  discriminatorField: string;
  recordsRead: number;
  driverCandidates: number;
  validMapped: number;
  testOrNoncanonical: number;
  excludedNonDriver: number;
  unmappedCountry: number;
  unmappedCity: number;
  malformed: number;
  unknownDiscriminator: number;
  conflictingRegistration: number;
  activeOperationalDuplicates: number;
  unexpectedCollections: number;
  authUidMismatch: number;
  phoneHashCollisions: number;
  plateHashCollisions: number;
  exactDocumentIdDuplicates: number;
  missingAuthUid: number;
  unknownRegistration: number;
  mappingReadyForLiveClose: boolean;
  partitionReconcileOk: boolean;
  writeTrapDenied: boolean;
  killSwitchDenied: boolean;
  killSwitch?: "PASS" | "FAIL" | "SKIPPED";
  postKill?: string;
  productionCalls: number;
  productionWrites: number;
  finalReadDisabled: boolean;
  finalWriteDisabled: boolean;
  diagnostics: DriverMappingDiagnostic[];
  unmappedSourceDocumentId?: string;
};

function emptyReport(status: LiveSafeReport["overallStatus"]): LiveSafeReport {
  return {
    overallStatus: status,
    shadowIdentity: SHADOW_SA,
    queryLimit: 0,
    discriminatorField: "ismndob",
    recordsRead: 0,
    driverCandidates: 0,
    validMapped: 0,
    testOrNoncanonical: 0,
    excludedNonDriver: 0,
    unmappedCountry: 0,
    unmappedCity: 0,
    malformed: 0,
    unknownDiscriminator: 0,
    conflictingRegistration: 0,
    activeOperationalDuplicates: 0,
    unexpectedCollections: 0,
    authUidMismatch: 0,
    phoneHashCollisions: 0,
    plateHashCollisions: 0,
    exactDocumentIdDuplicates: 0,
    missingAuthUid: 0,
    unknownRegistration: 0,
    mappingReadyForLiveClose: false,
    partitionReconcileOk: true,
    writeTrapDenied: false,
    killSwitchDenied: false,
    killSwitch: "SKIPPED",
    productionCalls: 0,
    productionWrites: 0,
    finalReadDisabled: true,
    finalWriteDisabled: true,
    diagnostics: [],
  };
}

const report: LiveSafeReport = emptyReport("SKIPPED");

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

function writeReport(): void {
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

describe("Phase 4A-5 live drivers harness — always-on regressions", () => {
  it("isPhase4A5LiveDriversEnabled: undefined/empty/0 → false; 1 → true", () => {
    expect(isPhase4A5LiveDriversEnabled(undefined)).toBe(false);
    expect(isPhase4A5LiveDriversEnabled("")).toBe(false);
    expect(isPhase4A5LiveDriversEnabled("0")).toBe(false);
    expect(isPhase4A5LiveDriversEnabled("1")).toBe(true);
    // Intentional live must not fail this suite — helper is pure, not process.env assert.
    expect(typeof LIVE_DRIVERS).toBe("boolean");
  });

  it("startup accepts drivers-only when configured", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        PRODUCTION_READ_ENABLED: true,
        PRODUCTION_READ_MODE: "shadow",
        AUTH_MODE: "verified_token",
        EXPECTED_PROJECT_ID: PROJECT_ID,
        PRODUCTION_WRITE_ENABLED: false,
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        FINANCE_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
        AGENT_WRITE_ENABLED: false,
        FULL_PII_SHADOW_ENABLED: false,
        LIVE_SHADOW_ALLOWED_RESOURCES: "drivers",
        PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger",
      }),
    ).not.toThrow();
  });

  it("write trap denies driver approve in shadow", () => {
    const trap = shadowTrapForRequest({
      method: "POST",
      path: "/api/drivers/approve",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");
    report.writeTrapDenied = true;
  });

  it("kill switch denies when Production read disabled", async () => {
    const c = createShadowReadContainer();
    await expect(
      c.productionReads.drivers.list(
        {
          scope: { type: "global" },
          serverScopeFilter: {},
          actorUid: "x",
          permissions: ["drivers:read"],
          requestId: "r",
          correlationId: "c",
        },
        {},
        { limit: 10 },
      ),
    ).rejects.toBeInstanceOf(ProductionReadDisabledError);
    report.killSwitchDenied = true;
  });
});

describe("Phase 4A-5 live drivers Production window (SKIP by default)", () => {
  afterAll(() => {
    if (!LIVE_DRIVERS) {
      report.overallStatus = "SKIPPED";
      report.blocker = "PHASE4A5_LIVE_DRIVERS!=1";
      report.finalReadDisabled =
        process.env.PRODUCTION_READ_ENABLED !== "true";
      report.finalWriteDisabled =
        process.env.PRODUCTION_WRITE_ENABLED !== "true";
      try {
        writeReport();
      } catch {
        /* ignore */
      }
    }
  });

  it(
    "operator-controlled drivers live shadow (requires PHASE4A5_LIVE_DRIVERS=1)",
    async () => {
      if (!LIVE_DRIVERS) {
        report.overallStatus = "SKIPPED";
        report.blocker = "PHASE4A5_LIVE_DRIVERS!=1 — live body not executed";
        return;
      }

      resetEnvCache();
      resetProductionAuthSingletonsForTests();
      mkdirSync(reportDir, { recursive: true });
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

      let observability: ReturnType<typeof createProductionReadObservability> | null =
        null;
      let wrappedClient: FirebaseAdminFirestoreReadClient | null = null;
      let ctx: ProductionReadContext | null = null;
      const liveAllowed = parseLiveShadowAllowedResources("drivers");
      let queryCount = 0;

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

        observability = createProductionReadObservability({
          sink: "file_ndjson",
          filePath: obsPath,
        });

        const token = process.env.FIREBASE_ID_TOKEN?.trim();
        if (!token) {
          report.overallStatus = "NO_GO";
          report.blocker = "FIREBASE_ID_TOKEN missing";
          expect.fail("NO-GO: FIREBASE_ID_TOKEN missing");
        }

        const auth = await resolveProductionVerifiedActor(
          token!,
          env,
          observability,
        );
        if (!auth.ok) {
          report.overallStatus = "NO_GO";
          report.blocker = `Auth failed: ${auth.reason}`;
          expect.fail(`NO-GO: Auth failed (${auth.reason})`);
        }
        report.authResult = `OK role=${auth.identity.role}`;

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

        wrappedClient = new FirebaseAdminFirestoreReadClient(factory);
        const repo = new FirebaseProductionDriverReadRepository({
          client: wrappedClient,
          productionReadEnabled: true,
          observability,
          liveShadowAllowedResources: liveAllowed,
        });

        ctx = {
          scope: auth.identity.scope,
          serverScopeFilter: {},
          actorUid: auth.identity.uid,
          permissions: ["drivers:read"],
          requestId: createRequestId(),
          correlationId: createCorrelationId(),
        };

        const page = await repo.list(
          ctx,
          {},
          { limit: PHASE_4A5_DRIVERS_MAX_PAGE },
        );
        queryCount = 1;
        report.productionCalls = 1;
        report.productionWrites = 0;
        report.queryLimit = page.queryMeta.queryLimit;
        report.discriminatorField = page.queryMeta.discriminatorField;
        const metrics = page.auditMetrics;
        report.recordsRead = metrics.recordsRead;
        report.driverCandidates = metrics.driverCandidates;
        report.validMapped = metrics.validMapped;
        report.testOrNoncanonical = metrics.testOrNoncanonical;
        report.excludedNonDriver = metrics.excludedNonDriver;
        report.unmappedCountry = metrics.unmappedCountry;
        report.unmappedCity = metrics.unmappedCity;
        report.malformed = metrics.malformed;
        report.unknownDiscriminator = metrics.unknownDiscriminator;
        report.conflictingRegistration = metrics.conflictingRegistration;
        report.activeOperationalDuplicates =
          metrics.activeOperationalDuplicates;
        report.unexpectedCollections = metrics.unexpectedCollections;
        report.authUidMismatch = metrics.authUidMismatch;
        report.phoneHashCollisions = metrics.phoneHashCollisions;
        report.plateHashCollisions = metrics.plateHashCollisions;
        report.exactDocumentIdDuplicates = metrics.exactDocumentIdDuplicates;
        report.missingAuthUid = metrics.missingAuthUid;
        report.unknownRegistration = metrics.unknownRegistration;
        report.diagnostics = page.driverMappingDiagnostics;
        report.partitionReconcileOk =
          reconcileDriverAuditPartition(metrics).ok;

        const withoutEvidence = page.driverMappingDiagnostics.filter(
          (d) =>
            d.mappingStatus === "excludedNonDriver" &&
            !excludedNonDriverHasAuthoritativeEvidence(d),
        ).length;
        report.mappingReadyForLiveClose = driverMappingReadyForLiveClose(
          metrics,
          { excludedNonDriverWithoutEvidence: withoutEvidence },
        );

        const unmapped = page.driverMappingDiagnostics.filter(
          (d) => d.mappingStatus === "unmappedCountry",
        );
        report.unmappedSourceDocumentId =
          unmapped[0]?.sourceDocumentId ??
          (metrics.unmappedCountry > 0 ? "UNAVAILABLE" : undefined);

        const trap = shadowTrapForRequest({
          method: "POST",
          path: "/api/drivers/approve",
          productionReadMode: "shadow",
          allowSyntheticMutations: false,
        });
        report.writeTrapDenied = trap.action === "deny";

        const shadow = createShadowReadContainer();
        await expect(
          shadow.writes.create({ resource: "drivers", operation: "create" }),
        ).rejects.toBeInstanceOf(ProductionWriteDisabledError);

        const gatesOk = driverLiveClosingGatesPass({
          unmappedCountry: metrics.unmappedCountry,
          unmappedCity: metrics.unmappedCity,
          unknownDiscriminator: metrics.unknownDiscriminator,
          malformed: metrics.malformed,
          conflictingRegistration: metrics.conflictingRegistration,
          activeOperationalDuplicates: metrics.activeOperationalDuplicates,
          exactDocumentIdDuplicates: metrics.exactDocumentIdDuplicates,
          unexpectedCollections: metrics.unexpectedCollections,
          productionWrites: report.productionWrites,
          excludedNonDriver: metrics.excludedNonDriver,
          excludedNonDriverWithoutEvidence: withoutEvidence,
        });

        if (
          !gatesOk ||
          !report.mappingReadyForLiveClose ||
          !report.partitionReconcileOk
        ) {
          report.overallStatus = "NO_GO";
          report.blocker = "mapping_or_duplicate_gate";
          report.mappingReadyForLiveClose = false;
          expect.fail(
            formatDriverMappingNoGoMessage(page.driverMappingDiagnostics),
          );
        }

        report.overallStatus = "PASS";
        expect(report.writeTrapDenied).toBe(true);
        expect(report.productionWrites).toBe(0);
      } catch (err) {
        if (report.overallStatus !== "PASS") {
          report.overallStatus = "NO_GO";
        }
        if (!report.blocker) {
          report.blocker = err instanceof Error ? err.message : String(err);
        }
        throw err;
      } finally {
        // Kill switch — always attempt; emit real observability event (Phase 4A-3/4A-4).
        try {
          const queriesBeforeKill = queryCount;
          process.env.PRODUCTION_READ_ENABLED = "false";
          resetEnvCache();

          if (observability) {
            observability.emit({
              type: "kill_switch_triggered",
              flag: "PRODUCTION_READ_ENABLED",
            });
          }

          if (wrappedClient && ctx) {
            const killed = new FirebaseProductionDriverReadRepository({
              client: wrappedClient,
              productionReadEnabled: false,
              observability: observability ?? undefined,
              liveShadowAllowedResources: liveAllowed,
            });
            await expect(
              killed.list(ctx, {}, { limit: 10 }),
            ).rejects.toBeInstanceOf(ProductionReadDisabledError);
            expect(queryCount).toBe(queriesBeforeKill);
          }

          report.killSwitch = "PASS";
          report.killSwitchDenied = true;
          report.postKill = "PRODUCTION_READ_DISABLED_NO_NEW_QUERY";
        } catch (killErr) {
          report.killSwitch = "FAIL";
          report.postKill = "KILL_SWITCH_VERIFY_FAILED";
          if (!report.blocker) {
            report.blocker =
              killErr instanceof Error ? killErr.message : String(killErr);
          }
        }

        disableProductionFlags();
        resetEnvCache();
        resetProductionAuthSingletonsForTests();
        report.finalReadDisabled =
          process.env.PRODUCTION_READ_ENABLED === "false";
        report.finalWriteDisabled =
          process.env.PRODUCTION_WRITE_ENABLED === "false";

        if (existsSync(obsPath)) {
          const obs = readFileSync(obsPath, "utf8");
          expect(obs).toContain("kill_switch_triggered");
          expect(driverLiveReportHasSensitiveLeak(obs)).toBe(false);
        }

        writeReport();
      }
    },
    LIVE_TIMEOUT_MS,
  );
});
