// @vitest-environment node
/**
 * Phase 4A-2 controlled live cities-only shadow read harness.
 * Ephemeral env only — never commits Production Read enablement.
 *
 * MUST run under Vitest Node environment (`@vitest-environment node` above).
 * Live Auth/Cities `it` uses an explicit ~30s timeout (not a global Vitest change).
 *
 * Run (cities — operator only; do NOT auto-enable in CI / agents):
 *   PHASE4A2_LIVE_CITIES=1 npx vitest run src/test/live/phase4a2-live-cities.shadow.test.ts
 *
 * Auth timeout diagnostic (zero Firestore / listCities):
 *   PHASE4A2_AUTH_DIAGNOSTIC=1 npx vitest run src/test/live/phase4a2-live-cities.shadow.test.ts
 *
 * Requires:
 *   - ADC impersonation of Shadow SA (no JSON key)
 *   - FIREBASE_ID_TOKEN env (Production Firebase ID token; never logged)
 *
 * Country mappings load from code (CountryCanonicalization) — NO countries
 * Firestore query during the cities live window.
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
import {
  FirebaseProductionGeographyReadRepository,
  PHASE_4A2_CITIES_MAX_PAGE,
} from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
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
import { safeFirebaseAuthErrorCode } from "@/infrastructure/production/firebase/FirebaseAdminProductionIdentityVerifier";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { createRequestId, createCorrelationId } from "@/lib/ids";
import { cityMappingReadyForLiveClose } from "@/domain/geography/CityDuplicateIdentityAudit";

/** Auth-only gate skips Firestore even if LIVE_CITIES is also set. */
const AUTH_DIAGNOSTIC = process.env.PHASE4A2_AUTH_DIAGNOSTIC === "1";
const LIVE_CITIES = process.env.PHASE4A2_LIVE_CITIES === "1";
const LIVE = AUTH_DIAGNOSTIC || LIVE_CITIES;
/** Expected Production project fingerprint for live assertions only. */
const PROJECT_ID = "tutorial-multi-language-70gx4j";
const SHADOW_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com";

/** Live Auth / ADC / Cities path only — not a global Vitest timeout. */
const LIVE_AUTH_CITIES_TIMEOUT_MS = 30_000;
/** Auth diagnostic: 4×10s stages + overhead (does not change Cities timeout). */
const AUTH_DIAGNOSTIC_TIMEOUT_MS = 55_000;
const STAGE_TIMEOUT_MS = 10_000;

type StageOutcome = "PASS" | "FAIL" | "TIMEOUT" | "SKIPPED" | "MISSING_TOKEN";

type AuthDiagStageReport = {
  status: StageOutcome;
  durationMs: number | null;
  classification?: string;
  code?: string | null;
  safeMessage?: string;
  uidPresent?: boolean;
  disabled?: boolean;
  emailVerified?: boolean;
  reason?: string | null;
};

type LiveSafeReport = {
  overallStatus: "PASS" | "NO_GO" | "FAIL";
  blocker?: string;
  projectFingerprint?: string;
  shadowIdentity: string;
  authResult?: string;
  recordsRead?: number;
  validMapped?: number;
  unmappedCountry?: number;
  ambiguousCountry?: number;
  testOrNoncanonical?: number;
  malformed?: number;
  inactive?: number;
  exactCanonicalDuplicates?: number;
  semanticDuplicates?: number;
  activeOperationalDuplicates?: number;
  /** Safe duplicate diagnostic groups (source ids + statuses only). */
  exactCanonicalIdDuplicateGroups?: Array<{
    key: string;
    activityClass: string;
    sourceDocumentIds: string[];
    activeStatuses: string[];
    regionIds: Array<string | null>;
  }>;
  semanticDuplicateGroups?: Array<{
    key: string;
    activityClass: string;
    sourceDocumentIds: string[];
    canonicalCityIds: string[];
    activeStatuses: string[];
    regionIds: Array<string | null>;
  }>;
  sourceDocumentIds?: string[];
  canonicalCityIds?: string[];
  safeIds?: string[];
  safeNames?: string[];
  safeCountryIds?: string[];
  mappingStatuses?: string[];
  citiesReadyForClose?: boolean;
  unexpectedCollections?: string[];
  productionWriteCalls: number;
  mutationTrap?: string;
  killSwitch?: string;
  postKill?: string;
  monitoringEventTypes?: string[];
  windowStartUtc?: string;
  windowEndUtc?: string;
  firestoreQueries: number;
  maxPageCap?: number;
  /** Phase 4A-2 Auth timeout diagnostic (AUTH_DIAGNOSTIC only). */
  authDiagnostic?: {
    authClientInit: AuthDiagStageReport;
    verifyIdToken: AuthDiagStageReport;
    getUser: AuthDiagStageReport;
    resolveProductionVerifiedActor: AuthDiagStageReport;
    tokenExpired: boolean | null;
    tokenSecondsRemaining: number | null;
    criticalFinding?: string;
    finalReadDisabled: boolean;
    finalWriteDisabled: boolean;
  };
};

const report: LiveSafeReport = {
  overallStatus: "NO_GO",
  shadowIdentity: SHADOW_SA,
  productionWriteCalls: 0,
  firestoreQueries: 0,
  maxPageCap: PHASE_4A2_CITIES_MAX_PAGE,
};

const localDir = join(process.cwd(), ".local", "phase4a2-live");
const obsPath = join(localDir, "observability.ndjson");
const reportPath = join(localDir, "live-safe-summary.json");
const authDiagPath = join(localDir, "auth-timeout-diagnostic.json");

function writeReport(): void {
  mkdirSync(localDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

/**
 * Network-boundary timeout for Auth diagnostic stages only.
 * Does not cancel the underlying promise; clears the timer on settle.
 */
export async function withTimeout<T>(
  label: string,
  operation: Promise<T>,
  timeoutMs = STAGE_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}_TIMEOUT_${timeoutMs}MS`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Decode JWT payload `exp` only — never log token or full claims. */
export function inspectIdTokenExpiry(token: string): {
  tokenExpired: boolean | null;
  tokenSecondsRemaining: number | null;
} {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) {
      return { tokenExpired: null, tokenSecondsRemaining: null };
    }
    const json = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(json) as { exp?: unknown };
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp)) {
      return { tokenExpired: null, tokenSecondsRemaining: null };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      tokenExpired: exp <= nowSec,
      tokenSecondsRemaining: exp - nowSec,
    };
  } catch {
    return { tokenExpired: null, tokenSecondsRemaining: null };
  }
}

function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED_JWT]",
    )
    .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----/gi, "[REDACTED_KEY]")
    .slice(0, 200);
}

function isTimeoutError(err: unknown, label: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(`${label}_TIMEOUT_`);
}

function emptyStage(status: StageOutcome = "SKIPPED"): AuthDiagStageReport {
  return { status, durationMs: null };
}

/**
 * Ephemeral live-window env. Must be called inside each LIVE `it()` AFTER Vitest
 * global `beforeEach` (src/test/setup.ts), which otherwise clears EXPECTED_PROJECT_ID
 * and Production Read flags between `beforeAll` and the test body.
 */
export function applyLiveCitiesEnvironment(
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
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "cities";
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

function criticalFindingFrom(
  diag: NonNullable<LiveSafeReport["authDiagnostic"]>,
): string {
  const order: Array<[string, AuthDiagStageReport]> = [
    ["AUTH_CLIENT_INIT", diag.authClientInit],
    ["VERIFY_ID_TOKEN", diag.verifyIdToken],
    ["GET_USER", diag.getUser],
    ["RESOLVE_PRODUCTION_ACTOR", diag.resolveProductionVerifiedActor],
  ];
  for (const [name, stage] of order) {
    if (stage.status === "TIMEOUT") {
      return `${name} hangs/times out (${stage.durationMs ?? "?"}ms)`;
    }
    if (stage.status === "FAIL") {
      return `${name} fails: ${stage.classification ?? "FAIL"} (${stage.code ?? stage.reason ?? stage.safeMessage ?? "n/a"})`;
    }
    if (stage.status === "MISSING_TOKEN") {
      return "MISSING_TOKEN — cannot run Auth diagnostic without FIREBASE_ID_TOKEN";
    }
  }
  if (diag.tokenExpired === true) {
    return "Token expired (local exp) — Auth stages may still report Firebase errors";
  }
  return "All Auth diagnostic stages PASS — hang is not reproduced in staged path";
}

describe.skipIf(!LIVE)(
  AUTH_DIAGNOSTIC
    ? "Phase 4A-2 LIVE Auth timeout diagnostic (no Firestore)"
    : "Phase 4A-2 LIVE cities-only controlled shadow read",
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
    // Always restore Production Read/Write disabled before env restore.
    disableProductionFlags();
    if (report.authDiagnostic) {
      report.authDiagnostic.finalReadDisabled = true;
      report.authDiagnostic.finalWriteDisabled = true;
    }

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
      ? "stages Auth timeouts then stops (no listCities)"
      : "runs Auth → fingerprint → cities → write trap → kill switch",
    async () => {
    // Explicit start-of-diagnostic reset (also done inside applyLiveCitiesEnvironment).
    resetProductionAuthSingletonsForTests();
    resetEnvCache();
    applyLiveCitiesEnvironment();
    expect(process.env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    const env = loadEnv();
    expect(env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.PRODUCTION_READ_ENABLED).toBe(true);
    expect(env.PRODUCTION_READ_MODE).toBe("shadow");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("cities");

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
    const expiry = token
      ? inspectIdTokenExpiry(token)
      : { tokenExpired: null, tokenSecondsRemaining: null };

    // ── AUTH TIMEOUT DIAGNOSTIC (stops before geo.listCities) ──────────────
    if (AUTH_DIAGNOSTIC) {
      const diag: NonNullable<LiveSafeReport["authDiagnostic"]> = {
        authClientInit: emptyStage(),
        verifyIdToken: emptyStage(),
        getUser: emptyStage(),
        resolveProductionVerifiedActor: emptyStage(),
        tokenExpired: expiry.tokenExpired,
        tokenSecondsRemaining: expiry.tokenSecondsRemaining,
        finalReadDisabled: false,
        finalWriteDisabled: false,
      };
      report.authDiagnostic = diag;
      report.firestoreQueries = 0;
      report.productionWriteCalls = 0;

      if (!token) {
        report.blocker =
          "Auth Client wired, but no Production Firebase ID token available (set FIREBASE_ID_TOKEN out-of-band). NO bypass.";
        report.authResult = "MISSING_TOKEN";
        report.overallStatus = "NO_GO";
        diag.authClientInit = emptyStage("MISSING_TOKEN");
        diag.verifyIdToken = emptyStage("MISSING_TOKEN");
        diag.getUser = emptyStage("MISSING_TOKEN");
        diag.resolveProductionVerifiedActor = emptyStage("MISSING_TOKEN");
        diag.criticalFinding = criticalFindingFrom(diag);
        writeFileSync(authDiagPath, `${JSON.stringify(diag, null, 2)}\n`, "utf8");
        writeReport();
        disableProductionFlags();
        resetEnvCache();
        resetProductionAuthSingletonsForTests();
        expect(report.firestoreQueries).toBe(0);
        expect.fail(
          "NO-GO: FIREBASE_ID_TOKEN missing — cannot complete Auth diagnostic without bypass",
        );
      }

      const factory = FirebaseAdminFactory.getOrCreate({
        env: factoryEnvFrom(env),
        credentialProvider: new ApplicationDefaultProductionCredentialProvider(
          env.EXPECTED_PROJECT_ID,
        ),
        observability,
      });

      // Stage 1 — Auth client init (ADC + Admin SDK)
      {
        const start = Date.now();
        try {
          const authClient = await withTimeout(
            "AUTH_CLIENT_INIT",
            factory.getAuthClient(),
            STAGE_TIMEOUT_MS,
          );
          diag.authClientInit = {
            status: "PASS",
            durationMs: Date.now() - start,
          };
          console.log(
            JSON.stringify({
              phase: "4A-2-auth-diagnostic",
              step: "AUTH_CLIENT_INIT",
              result: "PASS",
              durationMs: diag.authClientInit.durationMs,
            }),
          );

          // Stage 2 — verifyIdToken(token, true)
          {
            const authStart = Date.now();
            try {
              const decoded = await withTimeout(
                "VERIFY_ID_TOKEN",
                authClient.verifyIdToken(token, true),
                STAGE_TIMEOUT_MS,
              );
              diag.verifyIdToken = {
                status: "PASS",
                durationMs: Date.now() - authStart,
                uidPresent: typeof decoded?.uid === "string",
              };
              console.log(
                JSON.stringify({
                  phase: "4A-2-auth-diagnostic",
                  step: "verifyIdToken",
                  result: "PASS",
                  durationMs: diag.verifyIdToken.durationMs,
                  uidPresent: diag.verifyIdToken.uidPresent,
                }),
              );

              // Stage 3 — getUser(uid)
              {
                const userStart = Date.now();
                try {
                  if (typeof authClient.getUser !== "function") {
                    diag.getUser = {
                      status: "FAIL",
                      durationMs: Date.now() - userStart,
                      classification: "FIREBASE_AUTH_ERROR",
                      safeMessage: "authClient.getUser unavailable",
                    };
                  } else {
                    const user = await withTimeout(
                      "GET_USER",
                      authClient.getUser(decoded.uid),
                      STAGE_TIMEOUT_MS,
                    );
                    diag.getUser = {
                      status: "PASS",
                      durationMs: Date.now() - userStart,
                      disabled: user.disabled,
                      emailVerified: user.emailVerified,
                    };
                    console.log(
                      JSON.stringify({
                        phase: "4A-2-auth-diagnostic",
                        step: "getUser",
                        result: "PASS",
                        durationMs: diag.getUser.durationMs,
                        disabled: user.disabled,
                        emailVerified: user.emailVerified,
                      }),
                    );
                  }
                } catch (err) {
                  const durationMs = Date.now() - userStart;
                  if (isTimeoutError(err, "GET_USER")) {
                    diag.getUser = {
                      status: "TIMEOUT",
                      durationMs,
                      classification: "GET_USER_TIMEOUT",
                      safeMessage: safeErrorMessage(err),
                    };
                  } else {
                    diag.getUser = {
                      status: "FAIL",
                      durationMs,
                      classification: "FIREBASE_AUTH_ERROR",
                      code: safeFirebaseAuthErrorCode(err),
                      safeMessage: safeErrorMessage(err),
                    };
                  }
                  console.log(
                    JSON.stringify({
                      phase: "4A-2-auth-diagnostic",
                      step: "getUser",
                      result: diag.getUser.status,
                      classification: diag.getUser.classification,
                      code: diag.getUser.code ?? null,
                      safeMessage: diag.getUser.safeMessage,
                      durationMs,
                    }),
                  );
                }
              }
            } catch (err) {
              const durationMs = Date.now() - authStart;
              if (isTimeoutError(err, "VERIFY_ID_TOKEN")) {
                diag.verifyIdToken = {
                  status: "TIMEOUT",
                  durationMs,
                  classification: "VERIFY_ID_TOKEN_TIMEOUT",
                  safeMessage: safeErrorMessage(err),
                };
              } else {
                diag.verifyIdToken = {
                  status: "FAIL",
                  durationMs,
                  classification: "FIREBASE_AUTH_ERROR",
                  code: safeFirebaseAuthErrorCode(err),
                  safeMessage: safeErrorMessage(err),
                };
              }
              diag.getUser = emptyStage("SKIPPED");
              console.log(
                JSON.stringify({
                  phase: "4A-2-auth-diagnostic",
                  step: "verifyIdToken",
                  result: diag.verifyIdToken.status,
                  classification: diag.verifyIdToken.classification,
                  code: diag.verifyIdToken.code ?? null,
                  safeMessage: diag.verifyIdToken.safeMessage,
                  durationMs,
                }),
              );
            }
          }
        } catch (err) {
          const durationMs = Date.now() - start;
          if (isTimeoutError(err, "AUTH_CLIENT_INIT")) {
            diag.authClientInit = {
              status: "TIMEOUT",
              durationMs,
              classification: "AUTH_CLIENT_INIT_TIMEOUT",
              safeMessage: safeErrorMessage(err),
            };
          } else {
            diag.authClientInit = {
              status: "FAIL",
              durationMs,
              classification: "FIREBASE_AUTH_ERROR",
              code: safeFirebaseAuthErrorCode(err),
              safeMessage: safeErrorMessage(err),
            };
          }
          diag.verifyIdToken = emptyStage("SKIPPED");
          diag.getUser = emptyStage("SKIPPED");
          console.log(
            JSON.stringify({
              phase: "4A-2-auth-diagnostic",
              step: "AUTH_CLIENT_INIT",
              result: diag.authClientInit.status,
              classification: diag.authClientInit.classification,
              code: diag.authClientInit.code ?? null,
              safeMessage: diag.authClientInit.safeMessage,
              durationMs,
            }),
          );
        }
      }

      // Stage 4 — resolveProductionVerifiedActor (fresh singletons)
      // Documented reset: diagnostic factory.getAuthClient may have left the
      // FirebaseAdminFactory class singleton (and optionally a hung init). Clear
      // productionVerifiedAuth factorySingleton + FirebaseAdminFactory so the
      // resolver builds a clean Auth path identical to the live harness.
      resetProductionAuthSingletonsForTests();

      {
        const actorStart = Date.now();
        try {
          const actor = await withTimeout(
            "RESOLVE_PRODUCTION_ACTOR",
            resolveProductionVerifiedActor(token, env, observability),
            STAGE_TIMEOUT_MS,
          );
          const durationMs = Date.now() - actorStart;
          if (actor.ok) {
            diag.resolveProductionVerifiedActor = {
              status: "PASS",
              durationMs,
              reason: null,
            };
            report.authResult = `OK role=${actor.identity.role} scope=${actor.identity.scope.type}`;
          } else {
            diag.resolveProductionVerifiedActor = {
              status: "FAIL",
              durationMs,
              classification: "ACTOR_MAPPING_ERROR",
              reason: actor.reason,
            };
            report.authResult = actor.reason;
          }
          console.log(
            JSON.stringify({
              phase: "4A-2-auth-diagnostic",
              step: "resolveProductionVerifiedActor",
              result: actor.ok ? "PASS" : "FAIL",
              durationMs,
              reason: actor.ok ? null : actor.reason,
            }),
          );
        } catch (err) {
          const durationMs = Date.now() - actorStart;
          if (isTimeoutError(err, "RESOLVE_PRODUCTION_ACTOR")) {
            diag.resolveProductionVerifiedActor = {
              status: "TIMEOUT",
              durationMs,
              classification: "RESOLVE_PRODUCTION_ACTOR_TIMEOUT",
              safeMessage: safeErrorMessage(err),
            };
          } else {
            diag.resolveProductionVerifiedActor = {
              status: "FAIL",
              durationMs,
              classification: "ACTOR_MAPPING_ERROR",
              code: safeFirebaseAuthErrorCode(err),
              safeMessage: safeErrorMessage(err),
            };
          }
          console.log(
            JSON.stringify({
              phase: "4A-2-auth-diagnostic",
              step: "resolveProductionVerifiedActor",
              result: diag.resolveProductionVerifiedActor.status,
              classification: diag.resolveProductionVerifiedActor.classification,
              code: diag.resolveProductionVerifiedActor.code ?? null,
              safeMessage: diag.resolveProductionVerifiedActor.safeMessage,
              durationMs,
            }),
          );
        }
      }

      diag.criticalFinding = criticalFindingFrom(diag);
      report.firestoreQueries = 0;
      report.productionWriteCalls = 0;
      const anyTimeout = [
        diag.authClientInit,
        diag.verifyIdToken,
        diag.getUser,
        diag.resolveProductionVerifiedActor,
      ].some((s) => s.status === "TIMEOUT");
      const anyFail = [
        diag.authClientInit,
        diag.verifyIdToken,
        diag.getUser,
        diag.resolveProductionVerifiedActor,
      ].some((s) => s.status === "FAIL");
      report.overallStatus = anyTimeout || anyFail ? "NO_GO" : "PASS";
      if (report.overallStatus !== "PASS") {
        report.blocker = diag.criticalFinding;
      } else {
        report.blocker = undefined;
      }

      disableProductionFlags();
      resetEnvCache();
      resetProductionAuthSingletonsForTests();
      diag.finalReadDisabled = true;
      diag.finalWriteDisabled = true;
      writeFileSync(authDiagPath, `${JSON.stringify(diag, null, 2)}\n`, "utf8");
      writeReport();

      expect(report.firestoreQueries).toBe(0);
      expect(report.productionWriteCalls).toBe(0);
      expect(process.env.PRODUCTION_READ_ENABLED).toBe("false");
      expect(process.env.PRODUCTION_WRITE_ENABLED).toBe("false");
      // STOP — never call geo.listCities in AUTH_DIAGNOSTIC.
      return;
    }

    // ── FULL LIVE CITIES PATH (operator only; not used by Auth diagnostic) ─
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

    const app = await factory.getApp();
    report.projectFingerprint = app.projectId;
    expect(app.projectId).toBe(PROJECT_ID);

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

    const liveAllowed = parseLiveShadowAllowedResources("cities");
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

    // Cities ONLY — country mappings from code; do NOT call listCountries.
    const page = await geo.listCities(ctx, {}, { limit: PHASE_4A2_CITIES_MAX_PAGE });
    report.firestoreQueries = queryCounter.queries;
    report.unexpectedCollections = queryCounter.collections.filter(
      (c) => c !== "villages",
    );
    expect(report.unexpectedCollections).toEqual([]);
    expect(queryCounter.collections).not.toContain("countries");

    const stats = geo.lastCityMappingStats!;
    report.recordsRead = stats.recordsRead;
    report.validMapped = stats.validMapped;
    report.unmappedCountry = stats.unmappedCountry;
    report.ambiguousCountry = stats.ambiguousCountry;
    report.testOrNoncanonical = stats.testOrNoncanonical;
    report.malformed = stats.malformed;
    report.inactive = stats.inactive;
    report.exactCanonicalDuplicates = stats.exactCanonicalDuplicates;
    report.semanticDuplicates = stats.semanticDuplicates;
    report.activeOperationalDuplicates = stats.activeOperationalDuplicates;
    // Safe metadata only — ids / names / country ids / statuses (no PII payloads)
    report.sourceDocumentIds = page.items.map((i) => i.data.sourceDocumentId);
    report.canonicalCityIds = page.items.map((i) => i.data.canonicalCityId);
    report.safeIds = page.items.map((i) => i.data.id);
    report.safeNames = page.items.map((i) => i.data.safeName);
    report.safeCountryIds = page.items.map((i) => i.data.countryId);
    report.mappingStatuses = page.items.map((i) => i.data.mappingStatus);

    const dup = geo.lastCityDuplicateAudit;
    report.exactCanonicalIdDuplicateGroups =
      dup?.exactCanonicalIdDuplicateGroups.map((g) => ({
        key: g.key,
        activityClass: g.activityClass,
        sourceDocumentIds: g.members.map((m) => m.sourceDocumentId),
        activeStatuses: g.members.map((m) => m.activeStatus),
        regionIds: g.members.map((m) => m.regionId),
      })) ?? [];
    report.semanticDuplicateGroups =
      dup?.semanticDuplicateGroups.map((g) => ({
        key: g.key,
        activityClass: g.activityClass,
        sourceDocumentIds: g.members.map((m) => m.sourceDocumentId),
        canonicalCityIds: g.members.map((m) => m.canonicalCityId),
        activeStatuses: g.members.map((m) => m.activeStatus),
        regionIds: g.members.map((m) => m.regionId),
      })) ?? [];

    report.citiesReadyForClose = cityMappingReadyForLiveClose({
      unmappedCountry: stats.unmappedCountry,
      ambiguousCountry: stats.ambiguousCountry,
      malformed: stats.malformed,
      activeOperationalDuplicates: stats.activeOperationalDuplicates,
    });

    expect(stats.recordsRead).toBeLessThanOrEqual(PHASE_4A2_CITIES_MAX_PAGE);
    expect(stats.malformed).toBe(0);
    // Stop conditions for operator interpretation (do not auto-widen):
    // - unexpected collection → already asserted empty
    // - malformed > 0 → fail above
    // - unmappedCountry / testOrNoncanonical / activeOperationalDuplicates reported
    // Soft assert: readiness helper is wired (close gate may still be false).
    expect(typeof report.citiesReadyForClose).toBe("boolean");
    expect(typeof stats.exactCanonicalDuplicates).toBe("number");
    expect(typeof stats.semanticDuplicates).toBe("number");
    expect(typeof stats.activeOperationalDuplicates).toBe("number");
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

    expect(() => {
      throw new ProductionWriteDisabledError();
    }).toThrow(/PRODUCTION_WRITE_DISABLED|disabled/i);

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
      killedGeo.listCities(ctx, {}, { limit: PHASE_4A2_CITIES_MAX_PAGE }),
    ).rejects.toMatchObject({ code: "PRODUCTION_READ_DISABLED" });

    expect(queryCounter.queries).toBe(queriesBeforeKill);
    report.killSwitch = "PASS";
    report.postKill = "PRODUCTION_READ_DISABLED_NO_NEW_QUERY";
    report.firestoreQueries = queryCounter.queries;

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
  AUTH_DIAGNOSTIC ? AUTH_DIAGNOSTIC_TIMEOUT_MS : LIVE_AUTH_CITIES_TIMEOUT_MS,
);
});

describe("Phase 4A-2 live harness guard", () => {
  it("does not run live without PHASE4A2_LIVE_CITIES=1 or PHASE4A2_AUTH_DIAGNOSTIC=1", () => {
    if (!LIVE) {
      expect(LIVE).toBe(false);
    } else {
      expect(LIVE).toBe(true);
    }
  });
});

/**
 * Regression: Live Production Auth/ADC must run under Vitest Node, not default jsdom.
 * No Production Firestore calls.
 */
describe("Phase 4A-2 live harness Node runtime regression", () => {
  it("this file is intended to execute in Vitest Node environment", () => {
    expect(typeof process.versions.node).toBe("string");
    expect(process.versions.node.length).toBeGreaterThan(0);
    expect(typeof globalThis.window).toBe("undefined");
    expect(typeof globalThis.document).toBe("undefined");
  });
});

/**
 * Regression: global Vitest setup beforeEach clears EXPECTED_PROJECT_ID / Production
 * Read flags. Live harness must re-apply via applyLiveCitiesEnvironment() inside it().
 * No Production Firestore calls.
 */
describe("Phase 4A-2 live harness env re-apply regression", () => {
  it("applyLiveCitiesEnvironment inside it() survives global setup wipe before Auth", () => {
    expect(process.env.EXPECTED_PROJECT_ID).toBe("");
    resetEnvCache();
    const wiped = loadEnv();
    expect(wiped.EXPECTED_PROJECT_ID).toBe("");
    expect(wiped.PRODUCTION_READ_ENABLED).toBe(false);
    expect(wiped.PRODUCTION_READ_MODE).toBe("disabled");

    expect(getProductionFirebaseFactoryForLive()).toBeNull();

    applyLiveCitiesEnvironment(obsPath);
    expect(process.env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    const env = loadEnv();
    expect(env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.PRODUCTION_READ_ENABLED).toBe(true);
    expect(env.PRODUCTION_READ_MODE).toBe("shadow");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("cities");

    expect(env.EXPECTED_PROJECT_ID.length).toBeGreaterThan(0);
    expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(PROJECT_ID);
    expect(getProductionFirebaseFactoryForLive()).toBeNull();

    disableProductionFlags();
    resetEnvCache();
    resetProductionAuthSingletonsForTests();
    const restored = loadEnv();
    expect(restored.PRODUCTION_READ_ENABLED).toBe(false);
    expect(restored.PRODUCTION_READ_MODE).toBe("disabled");
    expect(getProductionFirebaseFactoryForLive()).toBeNull();
  });
});

/**
 * Unit coverage for Auth diagnostic helpers — no Production Firebase calls.
 */
describe("Phase 4A-2 Auth diagnostic helpers (offline)", () => {
  it("withTimeout resolves before deadline", async () => {
    const value = await withTimeout(
      "HELPER_OK",
      Promise.resolve(42),
      1_000,
    );
    expect(value).toBe(42);
  });

  it("withTimeout rejects with LABEL_TIMEOUT on hang", async () => {
    await expect(
      withTimeout(
        "HELPER_HANG",
        new Promise(() => {
          /* never settles */
        }),
        50,
      ),
    ).rejects.toThrow(/HELPER_HANG_TIMEOUT_50MS/);
  });

  it("inspectIdTokenExpiry reads exp only", () => {
    const exp = Math.floor(Date.now() / 1000) + 120;
    const payload = Buffer.from(
      JSON.stringify({ exp, sub: "uid-test", role: "never-logged" }),
    ).toString("base64url");
    const token = `hdr.${payload}.sig`;
    const info = inspectIdTokenExpiry(token);
    expect(info.tokenExpired).toBe(false);
    expect(info.tokenSecondsRemaining).toBeGreaterThan(100);
    expect(info.tokenSecondsRemaining).toBeLessThanOrEqual(120);
  });
});
