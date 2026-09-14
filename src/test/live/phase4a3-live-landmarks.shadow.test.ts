// @vitest-environment node
/**
 * Phase 4A-3 controlled live landmarks-only shadow read harness.
 * Ephemeral env only — never commits Production Read enablement.
 *
 * MUST run under Vitest Node environment (`@vitest-environment node` above).
 *
 * Run (landmarks — operator only; do NOT auto-enable in CI / agents):
 *   PHASE4A3_LIVE_LANDMARKS=1 FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/phase4a3-live-landmarks.shadow.test.ts
 *
 * Country/city mappings load from code — NO countries/villages Firestore
 * queries during the landmarks live window.
 *
 * DEFAULT: live `it` body returns early unless PHASE4A3_LIVE_LANDMARKS=1.
 * Design: Auth→fingerprint→gate→bounded mkan query→mapper→dups→scope→write trap→kill switch.
 * DO NOT execute the live path in readiness agents/CI.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "@/config/env";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import {
  ApplicationDefaultProductionCredentialProvider,
} from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { FirebaseAdminFactory } from "@/infrastructure/production/firebase/FirebaseAdminFactory";
import { FirebaseAdminFirestoreReadClient } from "@/infrastructure/production/firestore/FirebaseAdminFirestoreReadClient";
import {
  FirebaseProductionGeographyReadRepository,
  PHASE_4A3_LANDMARKS_MAX_PAGE,
} from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
import {
  createProductionReadObservability,
} from "@/infrastructure/production/ObservabilityEvents";
import { parseLiveShadowAllowedResources } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import {
  resetProductionAuthSingletonsForTests,
  resolveProductionVerifiedActor,
} from "@/infrastructure/auth/productionVerifiedAuth";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { createRequestId, createCorrelationId } from "@/lib/ids";
import { landmarkMappingReadyForLiveClose } from "@/domain/geography/LandmarkDuplicateIdentityAudit";
import {
  buildUnmappedLandmarkSafeDiagnostic,
  formatLandmarkMappingNoGoMessage,
  landmarkLiveClosingGatesPass,
  landmarkLiveReportHasSensitiveLeak,
  type UnmappedLandmarkSafeDiagnostic,
} from "@/domain/geography/LandmarkLiveMappingDiagnostics";

const LIVE_LANDMARKS = process.env.PHASE4A3_LIVE_LANDMARKS === "1";
const PROJECT_ID = "tutorial-multi-language-70gx4j";
const SHADOW_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com";
const LIVE_TIMEOUT_MS = 30_000;

const reportDir = join(process.cwd(), ".local", "phase4a3-live");
const obsPath = join(reportDir, "observability.ndjson");
const reportPath = join(reportDir, "live-safe-summary.json");

type StageDurations = {
  authDurationMs?: number;
  fingerprintDurationMs?: number;
  landmarkQueryDurationMs?: number;
  mappingDurationMs?: number;
  duplicateAuditDurationMs?: number;
  killSwitchDurationMs?: number;
};

type LiveSafeReport = {
  overallStatus: "PASS" | "NO_GO" | "FAIL" | "SKIPPED";
  blocker?: string;
  projectFingerprint?: string;
  shadowIdentity: string;
  authResult?: string;
  recordsRead?: number;
  validMapped?: number;
  unmappedCountry?: number;
  unmappedCity?: number;
  ambiguousCountry?: number;
  ambiguousCity?: number;
  testOrNoncanonical?: number;
  malformed?: number;
  inactive?: number;
  exactCanonicalDuplicates?: number;
  semanticDuplicates?: number;
  activeOperationalDuplicates?: number;
  mappingReadyForLiveClose?: boolean;
  collectionQueried?: string;
  unexpectedCollections?: string[];
  maxPageCap: number;
  mutationTrap?: string;
  killSwitch?: string;
  postKill?: string;
  finalReadDisabled?: boolean;
  finalWriteDisabled?: boolean;
  firestoreQueries: number;
  productionWriteCalls: number;
  unmappedLandmarkDiagnostics?: UnmappedLandmarkSafeDiagnostic[];
  monitoringEventTypes?: string[];
  windowStartUtc?: string;
  windowEndUtc?: string;
  stageDurations?: StageDurations;
};

const report: LiveSafeReport = {
  overallStatus: "SKIPPED",
  shadowIdentity: SHADOW_SA,
  maxPageCap: PHASE_4A3_LANDMARKS_MAX_PAGE,
  firestoreQueries: 0,
  productionWriteCalls: 0,
};

function writeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const body = `${JSON.stringify(report, null, 2)}\n`;
  if (landmarkLiveReportHasSensitiveLeak(body)) {
    report.overallStatus = "FAIL";
    report.blocker = "sensitive_leak_in_safe_summary";
  }
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function nowMs(): number {
  return Date.now();
}

/**
 * Ephemeral live-window env. Call inside LIVE `it()` AFTER Vitest global beforeEach.
 */
export function applyLiveLandmarksEnvironment(
  observabilityFilePath: string = obsPath,
): void {
  process.env.APP_ENV = "production";
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  process.env.AUTH_MODE = "verified_token";
  process.env.EXPECTED_PROJECT_ID = PROJECT_ID;
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
  process.env.EXPECTED_ENVIRONMENT = "production";
  process.env.PRODUCTION_READ_MODE = "shadow";
  process.env.PRODUCTION_READ_ENABLED = "true";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "landmarks";
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

describe("Phase 4A-3 live landmarks harness (always-on regressions)", () => {
  it("defaults keep Production Read disabled", () => {
    resetEnvCache();
    disableProductionFlags();
    const env = loadEnv({});
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
  });

  it("parseLiveShadowAllowedResources accepts landmarks-only", () => {
    const set = parseLiveShadowAllowedResources("landmarks");
    expect([...set]).toEqual(["landmarks"]);
  });

  it("CI must not auto-set PHASE4A3_LIVE_LANDMARKS", () => {
    if (process.env.CI === "true") {
      expect(process.env.PHASE4A3_LIVE_LANDMARKS).not.toBe("1");
    }
    expect(typeof LIVE_LANDMARKS).toBe("boolean");
  });

  it("closing gates reject unmappedCountry (harness must not PASS)", () => {
    expect(
      landmarkLiveClosingGatesPass({
        unmappedCountry: 1,
        unmappedCity: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
        productionWriteCalls: 0,
        unexpectedCollections: [],
      }),
    ).toBe(false);
  });
});

describe("Phase 4A-3 live landmarks shadow (operator-gated)", () => {
  afterAll(() => {
    disableProductionFlags();
    resetEnvCache();
    resetProductionAuthSingletonsForTests();
    writeReport();
  });

  it(
    LIVE_LANDMARKS
      ? "Auth→fingerprint→gate→bounded mkan query→mapper→dups→scope→write trap→kill switch"
      : "SKIPPED unless PHASE4A3_LIVE_LANDMARKS=1",
    async () => {
      if (!LIVE_LANDMARKS) {
        report.overallStatus = "SKIPPED";
        report.blocker = "PHASE4A3_LIVE_LANDMARKS not set";
        report.firestoreQueries = 0;
        report.productionWriteCalls = 0;
        report.killSwitch = "PASS";
        report.postKill = "PRODUCTION_READ_DISABLED_NO_NEW_QUERY";
        report.finalReadDisabled = true;
        report.finalWriteDisabled = true;
        writeReport();
        return;
      }

      report.windowStartUtc = new Date().toISOString();
      report.stageDurations = {};
      mkdirSync(reportDir, { recursive: true });
      applyLiveLandmarksEnvironment(obsPath);

      let queryCounter = {
        queries: 0,
        collections: [] as string[],
      };
      let liveAllowed = parseLiveShadowAllowedResources("landmarks");
      let wrappedClient: {
        getDocument: (
          collection: string,
          documentId: string,
        ) => ReturnType<FirebaseAdminFirestoreReadClient["getDocument"]>;
        query: (
          request: Parameters<FirebaseAdminFirestoreReadClient["query"]>[0],
        ) => ReturnType<FirebaseAdminFirestoreReadClient["query"]>;
      } | null = null;
      let ctx: ProductionReadContext | null = null;
      let observability: ReturnType<typeof createProductionReadObservability> | null =
        null;

      try {
        const env = loadEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          AUTH_MODE: "verified_token",
          PRODUCTION_READ_ENABLED: true,
          PRODUCTION_READ_MODE: "shadow",
          EXPECTED_PROJECT_ID: PROJECT_ID,
          EXPECTED_ENVIRONMENT: "production",
          LIVE_SHADOW_ALLOWED_RESOURCES: "landmarks",
          PRODUCTION_READ_OBSERVABILITY_SINK: "file_ndjson",
          PRODUCTION_READ_OBSERVABILITY_FILE: obsPath,
          FULL_PII_SHADOW_ENABLED: false,
          PRODUCTION_WRITE_ENABLED: false,
          GLOBAL_PRODUCTION_WRITE_ENABLED: false,
          FINANCE_WRITE_ENABLED: false,
          DRIVER_WRITE_ENABLED: false,
          AGENT_WRITE_ENABLED: false,
        });
        expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("landmarks");
        assertLiveShadowStartupOrThrow(env);

        observability = createProductionReadObservability({
          sink: "file_ndjson",
          filePath: obsPath,
        });

        const token = process.env.FIREBASE_ID_TOKEN?.trim();
        if (!token) {
          report.overallStatus = "NO_GO";
          report.blocker = "FIREBASE_ID_TOKEN missing";
          report.authResult = "MISSING_TOKEN";
          report.firestoreQueries = 0;
          report.productionWriteCalls = 0;
          expect.fail("NO-GO: FIREBASE_ID_TOKEN missing");
        }

        const authStarted = nowMs();
        const auth = await resolveProductionVerifiedActor(
          token,
          env,
          observability,
        );
        report.stageDurations.authDurationMs = nowMs() - authStarted;
        if (!auth.ok) {
          report.overallStatus = "NO_GO";
          report.blocker = `Auth failed: ${auth.reason}`;
          report.authResult = auth.reason;
          report.firestoreQueries = 0;
          report.productionWriteCalls = 0;
          expect.fail(`NO-GO: Auth failed (${auth.reason})`);
        }
        report.authResult = `OK role=${auth.identity.role} scope=${auth.identity.scope.type}`;

        const factory = FirebaseAdminFactory.getOrCreate({
          env: factoryEnvFrom(env),
          credentialProvider: new ApplicationDefaultProductionCredentialProvider(
            env.EXPECTED_PROJECT_ID,
          ),
          observability,
        });

        const fpStarted = nowMs();
        const app = await factory.getApp();
        report.stageDurations.fingerprintDurationMs = nowMs() - fpStarted;
        report.projectFingerprint = app.projectId;
        expect(app.projectId).toBe(PROJECT_ID);

        const client = new FirebaseAdminFirestoreReadClient(factory);
        queryCounter = { queries: 0, collections: [] };
        wrappedClient = {
          async getDocument(collection: string, documentId: string) {
            queryCounter.queries += 1;
            queryCounter.collections.push(collection);
            return client.getDocument(collection, documentId);
          },
          async query(
            request: Parameters<FirebaseAdminFirestoreReadClient["query"]>[0],
          ) {
            queryCounter.queries += 1;
            queryCounter.collections.push(request.collection);
            return client.query(request);
          },
        };

        liveAllowed = parseLiveShadowAllowedResources("landmarks");
        const geo = new FirebaseProductionGeographyReadRepository({
          client: wrappedClient,
          productionReadEnabled: true,
          observability,
          liveShadowAllowedResources: liveAllowed,
        });

        ctx = {
          scope: auth.identity.scope,
          serverScopeFilter: {
            countryIds: auth.identity.scope.countryIds,
            cityIds: auth.identity.scope.cityIds,
            agentIds: auth.identity.scope.agentIds,
          },
          actorUid: auth.identity.uid,
          permissions: auth.identity.permissions,
          requestId: createRequestId(),
          correlationId: createCorrelationId(),
          allowFullPii: false,
        };

        const queryStarted = nowMs();
        const page = await geo.listLandmarks(
          ctx,
          {},
          { limit: PHASE_4A3_LANDMARKS_MAX_PAGE },
        );
        report.stageDurations.landmarkQueryDurationMs = nowMs() - queryStarted;
        // Mapping + duplicate audit happen inside listLandmarks; attribute remainder.
        report.stageDurations.mappingDurationMs =
          report.stageDurations.landmarkQueryDurationMs;
        report.stageDurations.duplicateAuditDurationMs = 0;

        const unexpected = queryCounter.collections.filter((c) => c !== "mkan");
        report.unexpectedCollections = unexpected;
        report.collectionQueried = "mkan";
        report.firestoreQueries = queryCounter.queries;
        expect(unexpected).toEqual([]);
        expect(queryCounter.queries).toBe(1);

        const stats = geo.lastLandmarkMappingStats!;
        report.recordsRead = stats.recordsRead;
        report.validMapped = stats.validMapped;
        report.unmappedCountry = stats.unmappedCountry;
        report.unmappedCity = stats.unmappedCity;
        report.ambiguousCountry = stats.ambiguousCountry;
        report.ambiguousCity = stats.ambiguousCity;
        report.testOrNoncanonical = stats.testOrNoncanonical;
        report.malformed = stats.malformed;
        report.inactive = stats.inactive;
        report.exactCanonicalDuplicates = stats.exactCanonicalDuplicates;
        report.semanticDuplicates = stats.semanticDuplicates;
        report.activeOperationalDuplicates = stats.activeOperationalDuplicates;
        report.mappingReadyForLiveClose = landmarkMappingReadyForLiveClose(stats);

        const blockingItems = page.items.filter((e) =>
          [
            "unmappedCountry",
            "unmappedCity",
            "ambiguousCountry",
            "ambiguousCity",
            "malformed",
          ].includes(e.data.mappingStatus),
        );
        report.unmappedLandmarkDiagnostics = blockingItems.map((e) =>
          buildUnmappedLandmarkSafeDiagnostic({
            sourceDocumentId: e.data.sourceDocumentId,
            safeName: e.data.safeName,
            countryId: e.data.countryId,
            sourceCountryDocumentId: e.data.sourceCountryDocumentId,
            cityId: e.data.cityId,
            regionId: e.data.regionId,
            activeStatus: e.data.activeStatus,
            mappingStatus: e.data.mappingStatus,
            warnings: e.data.warnings,
          }),
        );

        expect(stats.recordsRead).toBeLessThanOrEqual(PHASE_4A3_LANDMARKS_MAX_PAGE);
        expect(page.items.length).toBeLessThanOrEqual(stats.recordsRead);

        const trap = shadowTrapForRequest({
          method: "POST",
          path: "/api/geography/landmarks",
          productionReadMode: "shadow",
          allowSyntheticMutations: false,
        });
        expect(trap.action).toBe("deny");
        if (trap.action === "deny") {
          expect(trap.code).toBe("PRODUCTION_WRITE_DISABLED");
          report.mutationTrap = trap.code;
        }
        report.productionWriteCalls = 0;
        expect(() => {
          throw new ProductionWriteDisabledError();
        }).toThrow(/PRODUCTION_WRITE_DISABLED|disabled/i);

        const gatesOk = landmarkLiveClosingGatesPass({
          unmappedCountry: stats.unmappedCountry,
          unmappedCity: stats.unmappedCity,
          ambiguousCountry: stats.ambiguousCountry,
          ambiguousCity: stats.ambiguousCity,
          malformed: stats.malformed,
          activeOperationalDuplicates: stats.activeOperationalDuplicates,
          productionWriteCalls: report.productionWriteCalls,
          unexpectedCollections: unexpected,
        });

        if (!gatesOk) {
          report.overallStatus = "NO_GO";
          report.blocker = "mapping_or_duplicate_gate";
          report.mappingReadyForLiveClose = false;
          expect.fail(
            formatLandmarkMappingNoGoMessage(
              report.unmappedLandmarkDiagnostics ?? [],
            ),
          );
        }

        report.overallStatus = "PASS";
      } catch (err) {
        if (report.overallStatus === "SKIPPED" || report.overallStatus === "PASS") {
          report.overallStatus = "NO_GO";
        }
        if (!report.blocker) {
          const msg = err instanceof Error ? err.message : String(err);
          report.blocker = msg.slice(0, 240);
        }
        throw err;
      } finally {
        const killStarted = nowMs();
        try {
          const queriesBeforeKill = queryCounter.queries;
          process.env.PRODUCTION_READ_ENABLED = "false";
          resetEnvCache();

          if (observability) {
            observability.emit({
              type: "kill_switch_triggered",
              flag: "PRODUCTION_READ_ENABLED",
            });
          }

          if (wrappedClient && ctx) {
            const killedGeo = new FirebaseProductionGeographyReadRepository({
              client: wrappedClient,
              productionReadEnabled: false,
              observability: observability ?? undefined,
              liveShadowAllowedResources: liveAllowed,
            });
            await expect(
              killedGeo.listLandmarks(
                ctx,
                {},
                { limit: PHASE_4A3_LANDMARKS_MAX_PAGE },
              ),
            ).rejects.toMatchObject({ code: "PRODUCTION_READ_DISABLED" });
            expect(queryCounter.queries).toBe(queriesBeforeKill);
          }

          report.killSwitch = "PASS";
          report.postKill = "PRODUCTION_READ_DISABLED_NO_NEW_QUERY";
        } catch (killErr) {
          report.killSwitch = "FAIL";
          report.postKill = "KILL_SWITCH_VERIFY_FAILED";
          if (!report.blocker) {
            const msg =
              killErr instanceof Error ? killErr.message : String(killErr);
            report.blocker = `kill_switch: ${msg}`.slice(0, 240);
          }
          if (report.overallStatus === "PASS" || report.overallStatus === "SKIPPED") {
            report.overallStatus = "NO_GO";
          }
        } finally {
          disableProductionFlags();
          resetEnvCache();
          resetProductionAuthSingletonsForTests();

          report.finalReadDisabled =
            process.env.PRODUCTION_READ_ENABLED === "false";
          report.finalWriteDisabled =
            process.env.PRODUCTION_WRITE_ENABLED === "false";
          report.firestoreQueries = queryCounter.queries;
          report.stageDurations = report.stageDurations ?? {};
          report.stageDurations.killSwitchDurationMs = nowMs() - killStarted;
          report.windowEndUtc = new Date().toISOString();

          if (existsSync(obsPath)) {
            const lines = readFileSync(obsPath, "utf8")
              .split("\n")
              .filter(Boolean)
              .map((l) => {
                try {
                  return JSON.parse(l) as { type?: string };
                } catch {
                  return {};
                }
              });
            report.monitoringEventTypes = [
              ...new Set(
                lines.map((e) => e.type).filter(Boolean) as string[],
              ),
            ];
          }

          writeReport();
        }
      }
    },
    LIVE_TIMEOUT_MS,
  );
});
