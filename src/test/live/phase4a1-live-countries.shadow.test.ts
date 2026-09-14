// @vitest-environment node
/**
 * Phase 4A-1 controlled live countries-only shadow read harness.
 * Ephemeral env only — never commits Production Read enablement.
 *
 * MUST run under Vitest Node environment (`@vitest-environment node` above).
 * Default jsdom causes Firebase Admin ADC Auth to fail with `app/invalid-credential`.
 * Live Auth/Countries `it` uses an explicit ~30s timeout (not a global Vitest change).
 *
 * Run (countries — operator only; do not auto-enable in CI):
 *   PHASE4A1_LIVE_COUNTRIES=1 npx vitest run src/test/live/phase4a1-live-countries.shadow.test.ts
 *
 * Auth-only gate (zero Firestore / listCountries):
 *   PHASE4A1_AUTH_DIAGNOSTIC=1 npx vitest run src/test/live/phase4a1-live-countries.shadow.test.ts
 *
 * Requires:
 *   - ADC impersonation of Shadow SA (no JSON key)
 *   - FIREBASE_ID_TOKEN env (Production Firebase ID token; never logged)
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "@/config/env";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import {
  ApplicationDefaultProductionCredentialProvider,
} from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { FirebaseAdminFactory } from "@/infrastructure/production/firebase/FirebaseAdminFactory";
import { FirebaseAdminFirestoreReadClient } from "@/infrastructure/production/firestore/FirebaseAdminFirestoreReadClient";
import { FirebaseProductionGeographyReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
import {
  createProductionReadObservability,
  type ProductionReadObservability,
} from "@/infrastructure/production/ObservabilityEvents";
import { parseLiveShadowAllowedResources } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import {
  getProductionFirebaseFactoryForLive,
  resetProductionAuthSingletonsForTests,
  resolveProductionVerifiedActor,
} from "@/infrastructure/auth/productionVerifiedAuth";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { createRequestId, createCorrelationId } from "@/lib/ids";

/** Auth-only gate skips Firestore even if LIVE_COUNTRIES is also set. */
const AUTH_DIAGNOSTIC = process.env.PHASE4A1_AUTH_DIAGNOSTIC === "1";
const LIVE_COUNTRIES = process.env.PHASE4A1_LIVE_COUNTRIES === "1";
const LIVE = AUTH_DIAGNOSTIC || LIVE_COUNTRIES;
/** Expected Production project fingerprint for live assertions only — Production Auth reads env. */
const PROJECT_ID = "tutorial-multi-language-70gx4j";
const SHADOW_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com";

/** Live Auth / ADC / Countries path only — not a global Vitest timeout. */
const LIVE_AUTH_COUNTRIES_TIMEOUT_MS = 30_000;

type LiveSafeReport = {
  overallStatus: "PASS" | "NO_GO" | "FAIL";
  blocker?: string;
  projectFingerprint?: string;
  shadowIdentity: string;
  authResult?: string;
  recordsRead?: number;
  recordsMapped?: number;
  canonicalIds?: string[];
  safeNames?: string[];
  mappingWarnings?: number;
  unmapped?: number;
  duplicates?: number;
  unexpectedCollections?: string[];
  productionWriteCalls: number;
  mutationTrap?: string;
  killSwitch?: string;
  postKill?: string;
  monitoringEventTypes?: string[];
  windowStartUtc?: string;
  windowEndUtc?: string;
  firestoreQueries: number;
};

const report: LiveSafeReport = {
  overallStatus: "NO_GO",
  shadowIdentity: SHADOW_SA,
  productionWriteCalls: 0,
  firestoreQueries: 0,
};

const localDir = join(process.cwd(), ".local", "phase4a1-live");
const obsPath = join(localDir, "observability.ndjson");
const reportPath = join(localDir, "live-safe-summary.json");

function writeReport(): void {
  mkdirSync(localDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

/**
 * Ephemeral live-window env. Must be called inside each LIVE `it()` AFTER Vitest
 * global `beforeEach` (src/test/setup.ts), which otherwise clears EXPECTED_PROJECT_ID
 * and Production Read flags between `beforeAll` and the test body.
 */
export function applyLiveEnvironment(observabilityFilePath: string = obsPath): void {
  process.env.APP_ENV = "production";
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  process.env.AUTH_MODE = "verified_token";
  process.env.EXPECTED_PROJECT_ID = PROJECT_ID;
  process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
  process.env.EXPECTED_ENVIRONMENT = "production";
  process.env.PRODUCTION_READ_MODE = "shadow";
  process.env.PRODUCTION_READ_ENABLED = "true";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "countries";
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
  // Clears productionVerifiedAuth factorySingleton + verifierOverride AND FirebaseAdminFactory
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

describe.skipIf(!LIVE)(
  AUTH_DIAGNOSTIC
    ? "Phase 4A-1 LIVE Auth diagnostic (no Firestore)"
    : "Phase 4A-1 LIVE countries-only controlled shadow read",
  () => {
  let observability: ProductionReadObservability;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    mkdirSync(localDir, { recursive: true });
    if (existsSync(obsPath)) {
      writeFileSync(obsPath, "", "utf8");
    }
    report.windowStartUtc = new Date().toISOString();
  });

  afterAll(() => {
    disableProductionFlags();

    // Restore prior process env (do not leave live enablement)
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    resetEnvCache();
    resetProductionAuthSingletonsForTests();
    report.windowEndUtc = new Date().toISOString();
    writeReport();
  });

  it(
    AUTH_DIAGNOSTIC
      ? "runs Auth then stops (no listCountries)"
      : "runs Auth → fingerprint → countries → write trap → kill switch",
    async () => {
    // Re-apply AFTER global setup beforeEach (which wipes live env set in beforeAll)
    applyLiveEnvironment();
    expect(process.env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    const env = loadEnv();
    expect(env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.PRODUCTION_READ_ENABLED).toBe(true);
    expect(env.PRODUCTION_READ_MODE).toBe("shadow");

    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(false);
    expect(env.AGENT_WRITE_ENABLED).toBe(false);
    expect(env.FULL_PII_SHADOW_ENABLED).toBe(false);

    assertLiveShadowStartupOrThrow(env);

    observability = createProductionReadObservability({
      sink: "file_ndjson",
      filePath: obsPath,
    });

    const token = process.env.FIREBASE_ID_TOKEN?.trim() ?? "";
    if (!token) {
      report.blocker =
        "Auth Client wired, but no Production Firebase ID token available (set FIREBASE_ID_TOKEN out-of-band). NO bypass.";
      report.authResult = "MISSING_TOKEN";
      report.overallStatus = "NO_GO";
      report.firestoreQueries = 0;
      report.productionWriteCalls = 0;
      writeReport();
      disableProductionFlags();
      resetEnvCache();
      // Fail the live suite so CI/operator sees blocker — not fabricated PASS
      expect.fail(
        "NO-GO: FIREBASE_ID_TOKEN missing — cannot complete verified-token Auth without bypass",
      );
    }

    const auth = await resolveProductionVerifiedActor(token, env, observability);
    if (!auth.ok) {
      report.blocker = `Auth verification failed: ${auth.reason}`;
      report.authResult = auth.reason;
      report.overallStatus = "NO_GO";
      report.firestoreQueries = 0;
      report.productionWriteCalls = 0;
      writeReport();
      if (AUTH_DIAGNOSTIC) {
        disableProductionFlags();
        resetEnvCache();
        expect(report.firestoreQueries).toBe(0);
        expect.fail(
          `AUTH_DIAGNOSTIC complete: Auth failed (${auth.reason}) — Firestore skipped`,
        );
      }
      expect.fail(`NO-GO: Auth failed (${auth.reason})`);
    }

    report.authResult = `OK role=${auth.identity.role} scope=${auth.identity.scope.type}`;

    // AUTH-ONLY — stop before fingerprint data path / listCountries / Firestore
    if (AUTH_DIAGNOSTIC) {
      report.firestoreQueries = 0;
      report.productionWriteCalls = 0;
      report.overallStatus = "PASS";
      report.blocker = undefined;
      writeReport();
      disableProductionFlags();
      resetEnvCache();
      expect(report.firestoreQueries).toBe(0);
      expect(report.productionWriteCalls).toBe(0);
      return;
    }

    // 2) Fingerprint via Production Firebase init (ADC) BEFORE data query
    const factory = FirebaseAdminFactory.getOrCreate({
      env: {
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
      },
      credentialProvider: new ApplicationDefaultProductionCredentialProvider(
        env.EXPECTED_PROJECT_ID,
      ),
      observability,
    });

    const app = await factory.getApp();
    report.projectFingerprint = app.projectId;
    expect(app.projectId).toBe(PROJECT_ID);

    // 3) Countries-only via FirebaseProductionGeographyReadRepository
    const client = new FirebaseAdminFirestoreReadClient(factory);
    const queryCounter = {
      queries: 0,
      collections: [] as string[],
    };
    const wrappedClient = {
      async getDocument(collection: string, documentId: string) {
        queryCounter.queries += 1;
        queryCounter.collections.push(collection);
        return client.getDocument(collection, documentId);
      },
      async query(request: Parameters<FirebaseAdminFirestoreReadClient["query"]>[0]) {
        queryCounter.queries += 1;
        queryCounter.collections.push(request.collection);
        return client.query(request);
      },
    };

    const liveAllowed = parseLiveShadowAllowedResources("countries");
    const geo = new FirebaseProductionGeographyReadRepository({
      client: wrappedClient,
      productionReadEnabled: true,
      observability,
      liveShadowAllowedResources: liveAllowed,
    });

    const ctx: ProductionReadContext = {
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

    const page = await geo.listCountries(ctx, {}, { limit: 20 });
    report.firestoreQueries = queryCounter.queries;
    report.unexpectedCollections = queryCounter.collections.filter(
      (c) => c !== "countries",
    );
    expect(report.unexpectedCollections).toEqual([]);

    const stats = geo.lastCountryMappingStats!;
    report.recordsRead = stats.recordsRead;
    report.recordsMapped = stats.validMapped;
    report.mappingWarnings = stats.withWarnings;
    report.unmapped = stats.unmappedValid;
    report.duplicates = stats.duplicates;
    report.canonicalIds = page.items.map((i) => i.data.id);
    report.safeNames = page.items.map((i) => i.data.name);

    expect(stats.recordsRead).toBeLessThanOrEqual(20);
    // Success gate: no unexpected unmapped valid countries; test fixtures reported separately.
    expect(stats.unmappedValid).toBe(0);
    expect(stats.duplicates).toBe(0);
    expect(stats.malformed).toBe(0);
    // testOrNoncanonical may be > 0 (e.g. CP5 FUNCTIONAL TEST COUNTRY) — reported, not aliased.

    // 4) Write trap — mutation must not write
    const trap = shadowTrapForRequest({
      method: "POST",
      path: "/api/agents/activate",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");
    if (trap.action === "deny") {
      expect(trap.code).toBe("PRODUCTION_WRITE_DISABLED");
      report.mutationTrap = trap.code;
    }
    report.productionWriteCalls = 0;

    // Also assert DisabledWriteRepository path
    expect(() => {
      throw new ProductionWriteDisabledError();
    }).toThrow(/PRODUCTION_WRITE_DISABLED|disabled/i);

    // 5) Kill switch live
    const queriesBeforeKill = queryCounter.queries;
    process.env.PRODUCTION_READ_ENABLED = "false";
    resetEnvCache();
    const killedGeo = new FirebaseProductionGeographyReadRepository({
      client: wrappedClient,
      productionReadEnabled: false,
      observability,
      liveShadowAllowedResources: liveAllowed,
    });
    observability.emit({
      type: "kill_switch_triggered",
      flag: "PRODUCTION_READ_ENABLED",
    });

    await expect(
      killedGeo.listCountries(ctx, {}, { limit: 20 }),
    ).rejects.toMatchObject({ code: "PRODUCTION_READ_DISABLED" });

    expect(queryCounter.queries).toBe(queriesBeforeKill);
    report.killSwitch = "PASS";
    report.postKill = "PRODUCTION_READ_DISABLED_NO_NEW_QUERY";
    report.firestoreQueries = queryCounter.queries;

    // Monitoring event types only (no payloads with secrets)
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
        ...new Set(lines.map((e) => e.type).filter(Boolean) as string[]),
      ];
      const blob = readFileSync(obsPath, "utf8");
      expect(blob).not.toMatch(/BEGIN PRIVATE KEY|Bearer eyJ|private_key/);
      expect(report.monitoringEventTypes).toEqual(
        expect.arrayContaining([
          "production_read_request",
          "kill_switch_triggered",
        ]),
      );
    }

    report.overallStatus = "PASS";
    writeReport();
  },
  LIVE_AUTH_COUNTRIES_TIMEOUT_MS,
);
});

// Always-on unit-ish guard so the file is collected when LIVE=0
describe("Phase 4A-1 live harness guard", () => {
  it("does not run live without PHASE4A1_LIVE_COUNTRIES=1 or PHASE4A1_AUTH_DIAGNOSTIC=1", () => {
    if (!LIVE) {
      expect(LIVE).toBe(false);
    } else {
      expect(LIVE).toBe(true);
    }
  });
});

/**
 * Regression: Live Production Auth/ADC must run under Vitest Node, not default jsdom.
 * jsdom caused Firebase Admin `app/invalid-credential` while the same ADC + token
 * PASSed with `--environment node`. No Production Firestore calls.
 */
describe("Phase 4A-1 live harness Node runtime regression", () => {
  it("this file is intended to execute in Vitest Node environment", () => {
    expect(typeof process.versions.node).toBe("string");
    expect(process.versions.node.length).toBeGreaterThan(0);
    // jsdom provides a global window; Node environment must not
    expect(typeof globalThis.window).toBe("undefined");
    expect(typeof globalThis.document).toBe("undefined");
  });
});

/**
 * Regression: global Vitest setup beforeEach clears EXPECTED_PROJECT_ID / Production
 * Read flags. Live harness must re-apply via applyLiveEnvironment() inside it() so
 * Auth never sees empty fingerprint values. No Production Firestore calls.
 */
describe("Phase 4A-1 live harness env re-apply regression", () => {
  it("applyLiveEnvironment inside it() survives global setup wipe before Auth", () => {
    // Global src/test/setup.ts beforeEach already ran: EXPECTED_PROJECT_ID="" etc.
    expect(process.env.EXPECTED_PROJECT_ID).toBe("");
    resetEnvCache();
    const wiped = loadEnv();
    expect(wiped.EXPECTED_PROJECT_ID).toBe("");
    expect(wiped.PRODUCTION_READ_ENABLED).toBe(false);
    expect(wiped.PRODUCTION_READ_MODE).toBe("disabled");

    // Production Auth internal factory must start null before Auth
    expect(getProductionFirebaseFactoryForLive()).toBeNull();

    // Same sequence live it() must use — AFTER any global beforeEach
    applyLiveEnvironment(obsPath);
    expect(process.env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    const env = loadEnv();
    expect(env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.PRODUCTION_READ_ENABLED).toBe(true);
    expect(env.PRODUCTION_READ_MODE).toBe("shadow");

    // Must not enter Auth / fingerprint with missing project id
    expect(env.EXPECTED_PROJECT_ID.length).toBeGreaterThan(0);
    expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(PROJECT_ID);
    // applyLiveEnvironment reset leaves Auth factory null until Auth runs
    expect(getProductionFirebaseFactoryForLive()).toBeNull();

    // Leave Disabled for subsequent suites (global beforeEach also resets)
    disableProductionFlags();
    resetEnvCache();
    resetProductionAuthSingletonsForTests();
    const restored = loadEnv();
    expect(restored.PRODUCTION_READ_ENABLED).toBe(false);
    expect(restored.PRODUCTION_READ_MODE).toBe("disabled");
    expect(getProductionFirebaseFactoryForLive()).toBeNull();
  });
});
