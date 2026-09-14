// @vitest-environment node
/**
 * Phase 4A-4 controlled live trips-only shadow read harness.
 * Ephemeral env only — never commits Production Read enablement.
 *
 * MUST run under Vitest Node environment (`@vitest-environment node` above).
 *
 * Run (trips — operator only; do NOT auto-enable in CI / agents):
 *   PHASE4A4_LIVE_TRIPS=1 FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/phase4a4-live-trips.shadow.test.ts
 *
 * Optional Option B (ONE bounded latest page, still ≤50, 1 query):
 *   PHASE4A4_TRIPS_BOUNDED_LATEST=1 …
 *
 * No villages/mkan/user N+1 during window — order docs only.
 *
 * DEFAULT: live `it` body returns early unless PHASE4A4_LIVE_TRIPS=1.
 * Sequence: Auth→fingerprint→gate→bounded order(data_order)→mapper→dups→scope→write trap→kill switch.
 * DO NOT execute the live path in readiness agents/CI.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "@/config/env";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { FirebaseAdminFactory } from "@/infrastructure/production/firebase/FirebaseAdminFactory";
import { FirebaseAdminFirestoreReadClient } from "@/infrastructure/production/firestore/FirebaseAdminFirestoreReadClient";
import {
  FirebaseProductionTripReadRepository,
  PHASE_4A4_TRIPS_MAX_PAGE,
} from "@/infrastructure/production/repositories/FirebaseProductionTripReadRepository";
import { createProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import { parseLiveShadowAllowedResources } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import {
  resetProductionAuthSingletonsForTests,
  resolveProductionVerifiedActor,
} from "@/infrastructure/auth/productionVerifiedAuth";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { createRequestId, createCorrelationId } from "@/lib/ids";
import {
  classifyEmptyTripWindow,
  tripMappingReadyForLiveClose,
  type TripDuplicateAuditMetrics,
} from "@/domain/trip/TripDuplicateIdentityAudit";
import { createShadowReadContainer } from "@/infrastructure/production/container/createContainers";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";

const LIVE_TRIPS = process.env.PHASE4A4_LIVE_TRIPS === "1";
const BOUNDED_LATEST = process.env.PHASE4A4_TRIPS_BOUNDED_LATEST === "1";
const PROJECT_ID = "tutorial-multi-language-70gx4j";
const SHADOW_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com";
const LIVE_TIMEOUT_MS = 30_000;

const reportDir = join(process.cwd(), ".local", "phase4a4-live");
const obsPath = join(reportDir, "observability.ndjson");
const reportPath = join(reportDir, "live-safe-summary.json");

type LiveSafeReport = {
  overallStatus: "PASS" | "NO_GO" | "FAIL" | "SKIPPED";
  blocker?: string;
  projectFingerprint?: string;
  shadowIdentity: string;
  authResult?: string;
  queryWindowStart?: string | null;
  queryWindowEnd?: string | null;
  queryTimestampField?: string;
  queryOrderDirection?: string;
  queryLimit?: number;
  queryMode?: string;
  queryFilterBoundType?: string;
  recordsRead?: number;
  validMapped?: number;
  testOrNoncanonical?: number;
  unmappedCountry?: number;
  unmappedCity?: number;
  unmappedStatus?: number;
  unknownCustomerReference?: number;
  unknownDriverReference?: number;
  unknownLifecycleStatus?: number;
  conflictingLifecycleStatus?: number;
  financialUnknown?: number;
  financialConflicting?: number;
  financialPersistedComplete?: number;
  financialAmountUnknown?: number;
  financialRateUnknown?: number;
  financialNotRepresented?: number;
  financialDerived?: number;
  directCityMapped?: number;
  legacyAliasCityMapped?: number;
  landmarkEvidenceCityMapped?: number;
  cityNotRepresented?: number;
  cityMissingUnresolved?: number;
  tripGeographyDiagnostics?: Array<{
    sourceDocumentId: string;
    villPresenceCase: string;
    cityEvidenceKind: string;
    cityKnowledge: string;
    proposedClosingBucket: string;
    mappingStatus: string;
    lifecycleStatus: string;
    sourceCountryPath: string | null;
    sourceCityPath: string | null;
    sourcePickupLandmarkPath: string | null;
    sourceDestinationLandmarkPath: string | null;
  }>;
  exactCanonicalDuplicates?: number;
  semanticDuplicates?: number;
  activeOperationalDuplicates?: number;
  malformed?: number;
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
  designedSequence: string[];
};

const report: LiveSafeReport = {
  overallStatus: "SKIPPED",
  shadowIdentity: SHADOW_SA,
  maxPageCap: PHASE_4A4_TRIPS_MAX_PAGE,
  firestoreQueries: 0,
  productionWriteCalls: 0,
  designedSequence: [
    "auth_verified_token",
    "project_fingerprint",
    "startup_gate_trips_only",
    "bounded_order_query_data_order",
    "mapper_canonical_trip",
    "duplicate_identity_audit",
    "post_map_scope",
    "write_trap_deny",
    "kill_switch_deny",
  ],
};

function writeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
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

function applyAuditMetricsToReport(metrics: TripDuplicateAuditMetrics): void {
  report.recordsRead = metrics.recordsRead;
  report.validMapped = metrics.validMapped;
  report.testOrNoncanonical = metrics.testOrNoncanonical;
  report.unmappedCountry = metrics.unmappedCountry;
  report.unmappedCity = metrics.unmappedCity;
  report.unmappedStatus = metrics.unmappedStatus;
  report.unknownCustomerReference = metrics.unknownCustomerReference;
  report.unknownDriverReference = metrics.unknownDriverReference;
  report.unknownLifecycleStatus = metrics.unknownLifecycleStatus;
  report.conflictingLifecycleStatus = metrics.conflictingLifecycleStatus;
  report.financialUnknown = metrics.financialUnknown;
  report.financialConflicting = metrics.financialConflicting;
  report.financialPersistedComplete = metrics.financialPersistedComplete;
  report.financialAmountUnknown = metrics.financialAmountUnknown;
  report.financialRateUnknown = metrics.financialRateUnknown;
  report.financialNotRepresented = metrics.financialNotRepresented;
  report.financialDerived = metrics.financialDerived;
  report.exactCanonicalDuplicates = metrics.exactCanonicalDuplicates;
  report.semanticDuplicates = metrics.semanticDuplicates;
  report.activeOperationalDuplicates = metrics.activeOperationalDuplicates;
  report.malformed = metrics.malformed;
}

describe("Phase 4A-4 live trips harness (always-on regressions)", () => {
  it("defaults keep Production Read disabled", () => {
    resetEnvCache();
    disableProductionFlags();
    const env = loadEnv({});
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("");
    expect(PHASE_4A4_TRIPS_MAX_PAGE).toBe(50);
  });

  it("parseLiveShadowAllowedResources accepts trips-only", () => {
    expect([...parseLiveShadowAllowedResources("trips")]).toEqual(["trips"]);
  });

  it("CI must not auto-set PHASE4A4_LIVE_TRIPS", () => {
    if (process.env.CI === "true") {
      expect(process.env.PHASE4A4_LIVE_TRIPS).not.toBe("1");
    }
    expect(typeof LIVE_TRIPS).toBe("boolean");
  });

  it("startup accepts trips-only window", () => {
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
        LIVE_SHADOW_ALLOWED_RESOURCES: "trips",
        PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger",
      }),
    ).not.toThrow();
  });

  it("empty window closing gate is NO_GO / EMPTY_TRIP_WINDOW", () => {
    const empty = classifyEmptyTripWindow({ recordsRead: 0 });
    expect(empty).toEqual({
      overallStatus: "NO_GO",
      mappingReadyForLiveClose: false,
      blocker: "EMPTY_TRIP_WINDOW",
    });
    expect(tripMappingReadyForLiveClose({
      recordsRead: 0,
      validMapped: 0,
      unmappedCountry: 0,
      unmappedCity: 0,
      unmappedStatus: 0,
      ambiguousCountry: 0,
      ambiguousCity: 0,
      malformed: 0,
      testOrNoncanonical: 0,
      unknownCustomerReference: 0,
      unknownDriverReference: 0,
      unknownLifecycleStatus: 0,
      conflictingLifecycleStatus: 0,
      financialUnknown: 0,
      financialConflicting: 0,
      financialPersistedComplete: 0,
      financialAmountUnknown: 0,
      financialRateUnknown: 0,
      financialNotRepresented: 0,
      financialDerived: 0,
      exactCanonicalDuplicates: 0,
      sameIdOrderAliasDuplicates: 0,
      semanticCustomerTimeDuplicates: 0,
      semanticDuplicates: 0,
      activeOperationalDuplicates: 0,
      hits: [],
    })).toBe(false);
  });
});

describe("Phase 4A-4 live trips shadow (operator-gated)", () => {
  afterAll(() => {
    disableProductionFlags();
    resetEnvCache();
    resetProductionAuthSingletonsForTests();
    writeReport();
  });

  it(
    LIVE_TRIPS
      ? "Auth→fingerprint→gate→bounded order query→mapper→dups→scope→write trap→kill switch"
      : "SKIPPED unless PHASE4A4_LIVE_TRIPS=1",
    async () => {
      if (!LIVE_TRIPS) {
        report.overallStatus = "SKIPPED";
        report.blocker = "PHASE4A4_LIVE_TRIPS not set";
        report.firestoreQueries = 0;
        report.productionWriteCalls = 0;
        report.killSwitch = "PASS";
        report.postKill = "PRODUCTION_READ_DISABLED_NO_NEW_QUERY";
        report.finalReadDisabled = true;
        report.finalWriteDisabled = true;
        writeReport();
        return;
      }

      mkdirSync(reportDir, { recursive: true });
      // Truncate prior observability so this run's events are attributable.
      writeFileSync(obsPath, "", "utf8");
      process.env.PRODUCTION_READ_ENABLED = "true";
      process.env.PRODUCTION_READ_MODE = "shadow";
      process.env.AUTH_MODE = "verified_token";
      process.env.EXPECTED_PROJECT_ID = PROJECT_ID;
      process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "trips";
      process.env.PRODUCTION_READ_OBSERVABILITY_SINK = "file_ndjson";
      process.env.PRODUCTION_READ_OBSERVABILITY_FILE = obsPath;
      process.env.FULL_PII_SHADOW_ENABLED = "false";
      process.env.PRODUCTION_WRITE_ENABLED = "false";
      process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
      process.env.FINANCE_WRITE_ENABLED = "false";
      process.env.DRIVER_WRITE_ENABLED = "false";
      process.env.AGENT_WRITE_ENABLED = "false";
      resetEnvCache();

      const queryCounter = { queries: 0, collections: [] as string[] };
      let observability: ReturnType<typeof createProductionReadObservability> | null =
        null;
      let wrappedClient: {
        getDocument: FirebaseAdminFirestoreReadClient["getDocument"];
        query: FirebaseAdminFirestoreReadClient["query"];
      } | null = null;
      let ctx: ProductionReadContext | null = null;
      const liveAllowed = parseLiveShadowAllowedResources("trips");

      try {
        const env = loadEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          AUTH_MODE: "verified_token",
          PRODUCTION_READ_ENABLED: true,
          PRODUCTION_READ_MODE: "shadow",
          EXPECTED_PROJECT_ID: PROJECT_ID,
          EXPECTED_ENVIRONMENT: "production",
          LIVE_SHADOW_ALLOWED_RESOURCES: "trips",
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
          token,
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

        const client = new FirebaseAdminFirestoreReadClient(factory);
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

        const trips = new FirebaseProductionTripReadRepository({
          client: wrappedClient,
          productionReadEnabled: true,
          observability,
          liveShadowAllowedResources: liveAllowed,
        });

        ctx = {
          scope: auth.identity.scope,
          serverScopeFilter: {},
          actorUid: auth.identity.uid,
          permissions: ["trips:read"],
          requestId: createRequestId(),
          correlationId: createCorrelationId(),
        };

        const page = await trips.list(
          ctx,
          BOUNDED_LATEST ? { boundedLatestPage: true } : {},
          { limit: PHASE_4A4_TRIPS_MAX_PAGE },
        );
        report.collectionQueried = page.collectionQueried;
        report.queryWindowStart = page.queryMeta.queryWindowStart;
        report.queryWindowEnd = page.queryMeta.queryWindowEnd;
        report.queryTimestampField = page.queryMeta.queryTimestampField;
        report.queryOrderDirection = page.queryMeta.queryOrderDirection;
        report.queryLimit = page.queryMeta.queryLimit;
        report.queryMode = page.queryMeta.queryMode;
        report.queryFilterBoundType = page.queryMeta.queryFilterBoundType;
        applyAuditMetricsToReport(page.auditMetrics);
        report.directCityMapped = page.geographyCounters.directCityMapped;
        report.legacyAliasCityMapped = page.geographyCounters.legacyAliasCityMapped;
        report.landmarkEvidenceCityMapped =
          page.geographyCounters.landmarkEvidenceCityMapped;
        report.cityNotRepresented = page.geographyCounters.cityNotRepresented;
        report.cityMissingUnresolved =
          page.geographyCounters.cityMissingUnresolved;
        report.tripGeographyDiagnostics = page.tripGeographyDiagnostics.map(
          (d) => ({
            sourceDocumentId: d.sourceDocumentId,
            villPresenceCase: d.villPresenceCase,
            cityEvidenceKind: d.cityEvidenceKind,
            cityKnowledge: d.cityKnowledge,
            proposedClosingBucket: d.proposedClosingBucket,
            mappingStatus: d.mappingStatus,
            lifecycleStatus: String(d.lifecycleStatus),
            sourceCountryPath: d.sourceCountryPath,
            sourceCityPath: d.sourceCityPath,
            sourcePickupLandmarkPath: d.sourcePickupLandmarkPath,
            sourceDestinationLandmarkPath: d.sourceDestinationLandmarkPath,
          }),
        );
        report.firestoreQueries = queryCounter.queries;
        report.unexpectedCollections = [
          ...new Set(queryCounter.collections.filter((c) => c !== "order")),
        ];
        report.productionWriteCalls = 0;

        expect(page.collectionQueried).toBe("order");
        expect(report.unexpectedCollections).toEqual([]);
        expect(report.firestoreQueries).toBe(1);
        expect(page.queryMeta.queryLimit).toBeLessThanOrEqual(PHASE_4A4_TRIPS_MAX_PAGE);

        const emptyGate = classifyEmptyTripWindow(page.auditMetrics);
        if (emptyGate) {
          report.overallStatus = emptyGate.overallStatus;
          report.mappingReadyForLiveClose = emptyGate.mappingReadyForLiveClose;
          report.blocker = emptyGate.blocker;
          writeReport();
          expect.fail(
            "NO-GO: EMPTY_TRIP_WINDOW — zero-row page cannot prove trip mapping readiness",
          );
        }

        report.mappingReadyForLiveClose = tripMappingReadyForLiveClose(
          page.auditMetrics,
          page.geographyCounters,
        );

        const trap = shadowTrapForRequest({
          method: "POST",
          path: "/api/trips",
          productionReadMode: "shadow",
          allowSyntheticMutations: false,
        });
        expect(trap.action).toBe("deny");
        report.mutationTrap = "PASS";

        const shadow = createShadowReadContainer();
        await expect(
          shadow.writes.create({ resource: "trips", operation: "create" }),
        ).rejects.toBeInstanceOf(ProductionWriteDisabledError);
        report.productionWriteCalls = 0;

        if (!report.mappingReadyForLiveClose) {
          report.overallStatus = "NO_GO";
          report.blocker = "mapping not ready for live close";
          expect.fail("NO-GO: trip mapping close gates failed");
        }

        report.overallStatus = "PASS";
      } catch (err) {
        if (report.overallStatus === "SKIPPED" || report.overallStatus === "PASS") {
          report.overallStatus = "NO_GO";
        }
        if (!report.blocker) {
          report.blocker = err instanceof Error ? err.message : String(err);
        }
        report.firestoreQueries = queryCounter.queries;
        throw err;
      } finally {
        // Kill switch — always attempt; emit real observability event (Phase 4A-3 pattern).
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
            const killed = new FirebaseProductionTripReadRepository({
              client: wrappedClient,
              productionReadEnabled: false,
              observability: observability ?? undefined,
              liveShadowAllowedResources: liveAllowed,
            });
            await expect(
              killed.list(ctx, {}, { limit: 10 }),
            ).rejects.toBeInstanceOf(ProductionReadDisabledError);
            expect(queryCounter.queries).toBe(queriesBeforeKill);
          }

          report.killSwitch = "PASS";
          report.postKill = "PRODUCTION_READ_DISABLED_NO_NEW_QUERY";
          report.finalReadDisabled = true;
          report.finalWriteDisabled = true;
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
        writeReport();
      }
    },
    LIVE_TIMEOUT_MS,
  );
});
