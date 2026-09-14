// @vitest-environment node
/**
 * Phase 4B controlled live cross-resource shadow validation harness.
 * Ephemeral env only — never commits Production Read enablement.
 *
 * Run (operator only; do NOT auto-enable in CI / agents):
 *   PHASE4B_LIVE_SHADOW_VALIDATION=1 FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/phase4b-live-shadow-validation.test.ts
 *
 * ADC + impersonation (existing shadow SA — do NOT create keys / change IAM):
 *   touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com
 *   project: tutorial-multi-language-70gx4j
 *
 * DEFAULT: live `it` body returns early unless PHASE4B_LIVE_SHADOW_VALIDATION=1.
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
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { createProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import {
  parseLiveShadowAllowedResources,
  PHASE_4B_LIVE_RESOURCES,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import {
  resetProductionAuthSingletonsForTests,
  resolveProductionVerifiedActor,
} from "@/infrastructure/auth/productionVerifiedAuth";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { createRequestId, createCorrelationId } from "@/lib/ids";
import { isPhase4BLiveShadowEnabled } from "@/domain/shadow-validation/isPhase4BLiveShadowEnabled";
import {
  runPhase4BShadowValidation,
  assertSerializedHasNoRawPii,
  PHASE_4B_EXPECTED_PROJECT_ID,
  PHASE_4B_SHADOW_SA,
  type Phase4BShadowSummary,
} from "@/application/shadow-validation";
import { assertProductionWriteAllowed } from "@/config/safety";
import { createShadowReadContainer } from "@/infrastructure/production/container/createContainers";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";

const LIVE = isPhase4BLiveShadowEnabled(
  process.env.PHASE4B_LIVE_SHADOW_VALIDATION,
);
const PROJECT_ID = PHASE_4B_EXPECTED_PROJECT_ID;
const SHADOW_SA = PHASE_4B_SHADOW_SA;
const LIVE_TIMEOUT_MS = 60_000;
const ALL_RESOURCES = PHASE_4B_LIVE_RESOURCES.join(",");

const reportDir = join(process.cwd(), ".local", "phase4b-live");
const obsPath = join(reportDir, "observability.ndjson");
const reportPath = join(reportDir, "live-safe-summary.json");

type LiveSafeReport = Phase4BShadowSummary & {
  shadowIdentity: string;
  authResult?: string;
  productionReadCompleted: boolean;
  liveExecuted: boolean;
};

function emptyReport(
  status: Phase4BShadowSummary["overallStatus"] | "SKIPPED",
): LiveSafeReport {
  const base: Phase4BShadowSummary = {
    overallStatus: status === "SKIPPED" ? "NO_GO" : status,
    projectFingerprint: PROJECT_ID,
    resources: {
      countries: {
        resource: "countries",
        status: "SKIPPED",
        recordsRead: 0,
        pageLimit: 20,
        queryCount: 0,
      },
      cities: {
        resource: "cities",
        status: "SKIPPED",
        recordsRead: 0,
        pageLimit: 50,
        queryCount: 0,
      },
      landmarks: {
        resource: "landmarks",
        status: "SKIPPED",
        recordsRead: 0,
        pageLimit: 50,
        queryCount: 0,
      },
      trips: {
        resource: "trips",
        status: "SKIPPED",
        recordsRead: 0,
        pageLimit: 50,
        queryCount: 0,
      },
      drivers: {
        resource: "drivers",
        status: "SKIPPED",
        recordsRead: 0,
        pageLimit: 50,
        queryCount: 0,
      },
      agents: {
        resource: "agents",
        status: "SKIPPED",
        recordsRead: 0,
        pageLimit: 50,
        queryCount: 0,
      },
      customers: {
        resource: "customers",
        status: "SKIPPED",
        recordsRead: 0,
        pageLimit: 50,
        queryCount: 0,
      },
    },
    crossResource: {
      brokenCountryReferences: 0,
      brokenCityReferences: 0,
      crossDomainConflicts: 0,
      roleContaminationCorrectlyExcluded: 0,
      unknownIdentityCount: 0,
      countriesWithOneActiveAgent: 0,
      countriesWithNoAgent: 0,
      countriesWithMultipleActiveAgents: 0,
      piiViolations: 0,
      financialConflicts: 0,
      financialMissingAsZero: 0,
      unexpectedCollectionAccess: 0,
      scopeViolations: 0,
      paginationDuplicates: 0,
    },
    productionCalls: 0,
    productionWrites: 0,
    partitionReconcileOk: false,
    scopeValidationPass: false,
    paginationValidationPass: false,
    killSwitchPass: false,
    writeTrapsPass: false,
    fullPiiShadowEnabled: false,
    postKill: "NOT_RUN",
    shadowValidationPassed: false,
    eligibleForControlledWritesPhase: false,
    controlledWritesEnabled: false,
    readyForControlledWrites: false,
    blockers: status === "SKIPPED" ? ["live_not_executed"] : [],
  };
  return {
    ...base,
    shadowIdentity: SHADOW_SA,
    productionReadCompleted: false,
    liveExecuted: false,
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
  expect(assertSerializedHasNoRawPii(serialized).piiViolations).toBe(0);
  writeFileSync(reportPath, serialized);
}

afterAll(() => {
  try {
    writeReport();
  } catch {
    // ignore
  }
});

describe("Phase 4B live shadow validation harness (SKIP by default)", () => {
  it("always-on: live flag helper + resource set + write trap deny", () => {
    expect(isPhase4BLiveShadowEnabled(undefined)).toBe(false);
    expect(isPhase4BLiveShadowEnabled("1")).toBe(true);
    expect(PHASE_4B_LIVE_RESOURCES).toHaveLength(7);

    const trap = shadowTrapForRequest({
      method: "POST",
      path: "/api/drivers/approve",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");

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
        CUSTOMER_WRITE_ENABLED: false,
        FULL_PII_SHADOW_ENABLED: false,
        LIVE_SHADOW_ALLOWED_RESOURCES: ALL_RESOURCES,
        PRODUCTION_READ_OBSERVABILITY_SINK: "file_ndjson",
      }),
    ).not.toThrow();
  });

  it(
    "operator-controlled Phase 4B live shadow (requires PHASE4B_LIVE_SHADOW_VALIDATION=1)",
    async () => {
      if (!LIVE) {
        report.blockers = ["PHASE4B_LIVE_SHADOW_VALIDATION!=1 — skipped"];
        expect(LIVE).toBe(false);
        return;
      }

      report.liveExecuted = true;
      mkdirSync(reportDir, { recursive: true });
      writeFileSync(obsPath, "", "utf8");
      resetEnvCache();
      resetProductionAuthSingletonsForTests();

      process.env.PRODUCTION_READ_ENABLED = "true";
      process.env.PRODUCTION_READ_MODE = "shadow";
      process.env.AUTH_MODE = "verified_token";
      process.env.EXPECTED_PROJECT_ID = PROJECT_ID;
      process.env.LIVE_SHADOW_ALLOWED_RESOURCES = ALL_RESOURCES;
      process.env.PRODUCTION_WRITE_ENABLED = "false";
      process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
      process.env.FINANCE_WRITE_ENABLED = "false";
      process.env.DRIVER_WRITE_ENABLED = "false";
      process.env.AGENT_WRITE_ENABLED = "false";
      process.env.CUSTOMER_WRITE_ENABLED = "false";
      process.env.FULL_PII_SHADOW_ENABLED = "false";
      process.env.PRODUCTION_READ_OBSERVABILITY_SINK = "file_ndjson";
      process.env.PRODUCTION_READ_OBSERVABILITY_FILE = obsPath;
      resetEnvCache();

      let observability: ReturnType<
        typeof createProductionReadObservability
      > | null = null;

      try {
        const env = loadEnv({
          NODE_ENV: "production",
          APP_ENV: "production",
          AUTH_MODE: "verified_token",
          PRODUCTION_READ_ENABLED: true,
          PRODUCTION_READ_MODE: "shadow",
          EXPECTED_PROJECT_ID: PROJECT_ID,
          EXPECTED_ENVIRONMENT: "production",
          LIVE_SHADOW_ALLOWED_RESOURCES: ALL_RESOURCES,
          PRODUCTION_READ_OBSERVABILITY_SINK: "file_ndjson",
          PRODUCTION_READ_OBSERVABILITY_FILE: obsPath,
          FULL_PII_SHADOW_ENABLED: false,
          PRODUCTION_WRITE_ENABLED: false,
          GLOBAL_PRODUCTION_WRITE_ENABLED: false,
          FINANCE_WRITE_ENABLED: false,
          DRIVER_WRITE_ENABLED: false,
          AGENT_WRITE_ENABLED: false,
          CUSTOMER_WRITE_ENABLED: false,
        });
        assertLiveShadowStartupOrThrow(env);

        observability = createProductionReadObservability({
          sink: "file_ndjson",
          filePath: obsPath,
        });

        const token = process.env.FIREBASE_ID_TOKEN?.trim();
        if (!token) {
          report.blockers = ["FIREBASE_ID_TOKEN missing"];
          report.overallStatus = "NO_GO";
          expect.fail("NO-GO: FIREBASE_ID_TOKEN missing");
        }

        const auth = await resolveProductionVerifiedActor(
          token!,
          env,
          observability,
        );
        if (!auth.ok) {
          report.blockers = [`Auth failed: ${auth.reason}`];
          report.overallStatus = "NO_GO";
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
        const allowed = parseLiveShadowAllowedResources(ALL_RESOURCES);

        const repos = createProductionReadRepositories({
          client,
          productionReadEnabled: true,
          fullPiiShadowEnabled: false,
          liveShadowAllowedResources: allowed,
          observability,
        });

        const readCtx: ProductionReadContext = {
          scope: auth.identity.scope,
          serverScopeFilter: {},
          actorUid: auth.identity.uid,
          permissions: auth.identity.permissions,
          requestId: createRequestId(),
          correlationId: createCorrelationId(),
        };

        const summary = await runPhase4BShadowValidation({
          repos,
          ctx: readCtx,
          env: {
            PRODUCTION_WRITE_ENABLED: false,
            GLOBAL_PRODUCTION_WRITE_ENABLED: false,
            DRIVER_WRITE_ENABLED: false,
            AGENT_WRITE_ENABLED: false,
            CUSTOMER_WRITE_ENABLED: false,
            FINANCE_WRITE_ENABLED: false,
            FULL_PII_SHADOW_ENABLED: false,
            EXPECTED_PROJECT_ID: PROJECT_ID,
          },
          projectFingerprint: PROJECT_ID,
          createKilledRepos: () =>
            createProductionReadRepositories({
              client,
              productionReadEnabled: false,
              fullPiiShadowEnabled: false,
              liveShadowAllowedResources: allowed,
              observability: observability!,
            }),
        });

        Object.assign(report, summary);
        report.shadowIdentity = SHADOW_SA;
        report.productionReadCompleted = true;
        report.liveExecuted = true;

        const approve = shadowTrapForRequest({
          method: "POST",
          path: "/api/drivers/approve",
          productionReadMode: "shadow",
          allowSyntheticMutations: false,
        });
        expect(approve.action).toBe("deny");

        const shadow = createShadowReadContainer();
        await expect(
          shadow.writes.create({ resource: "drivers", operation: "approve" }),
        ).rejects.toBeInstanceOf(ProductionWriteDisabledError);

        expect(() => assertProductionWriteAllowed("agent", env)).toThrow(
          /PRODUCTION_WRITE|WRITE_BLOCKED|WRITE_ENABLED/,
        );

        expect(report.productionWrites).toBe(0);
        expect(report.fullPiiShadowEnabled).toBe(false);
        expect(report.shadowValidationPassed).toBe(true);
        expect(report.eligibleForControlledWritesPhase).toBe(true);
        expect(report.controlledWritesEnabled).toBe(false);
        expect(report.readyForControlledWrites).toBe(true); // A ≠ activation
        expect(report.overallStatus).toBe("PASS");
      } finally {
        process.env.PRODUCTION_READ_ENABLED = "false";
        process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
        resetEnvCache();
        observability?.emit({
          type: "kill_switch_triggered",
          flag: "PRODUCTION_READ_ENABLED",
        });
      }
    },
    LIVE_TIMEOUT_MS,
  );
});
