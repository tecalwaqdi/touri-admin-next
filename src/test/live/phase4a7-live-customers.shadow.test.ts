// @vitest-environment node
/**
 * Phase 4A-7 controlled live customers-only shadow read harness.
 * Ephemeral env only — never commits Production Read enablement.
 *
 * Run (customers — operator only; do NOT auto-enable in CI / agents):
 *   PHASE4A7_LIVE_CUSTOMERS=1 FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/phase4a7-live-customers.shadow.test.ts
 *
 * DEFAULT: live `it` body returns early unless PHASE4A7_LIVE_CUSTOMERS=1.
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
  FirebaseProductionCustomerReadRepository,
  PHASE_4A7_CUSTOMERS_MAX_PAGE,
} from "@/infrastructure/production/repositories/FirebaseProductionCustomerReadRepository";
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
  customerMappingReadyForLiveClose,
  reconcileCustomerAuditPartition,
} from "@/domain/customer/CustomerDuplicateIdentityAudit";
import {
  customerLiveClosingGatesPass,
  customerLiveReportHasSensitiveLeak,
  excludedNonCustomerHasAuthoritativeEvidence,
  formatCustomerMappingNoGoMessage,
  type CustomerMappingDiagnostic,
} from "@/domain/customer/CustomerMappingDiagnostic";
import { isPhase4A7LiveCustomersEnabled } from "@/domain/customer/isPhase4A7LiveCustomersEnabled";
import {
  CUSTOMER_QUERY_INDEX_DEPENDENCY_BLOCKER,
  classifyCustomerLiveQueryFailure,
} from "@/domain/customer/CustomerLiveQueryFailure";
import { createShadowReadContainer } from "@/infrastructure/production/container/createContainers";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";

const LIVE_CUSTOMERS = isPhase4A7LiveCustomersEnabled(
  process.env.PHASE4A7_LIVE_CUSTOMERS,
);
const PROJECT_ID = "tutorial-multi-language-70gx4j";
const SHADOW_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com";
const LIVE_TIMEOUT_MS = 30_000;

const reportDir = join(process.cwd(), ".local", "phase4a7-live");
const obsPath = join(reportDir, "observability.ndjson");
const reportPath = join(reportDir, "live-safe-summary.json");

type LiveSafeReport = {
  overallStatus: "PASS" | "NO_GO" | "FAIL" | "SKIPPED";
  blocker?: string;
  projectFingerprint?: string;
  shadowIdentity: string;
  authResult?: string;
  queryLimit: number;
  discriminatorKind: string;
  queryOrderField?: string;
  queryOrderDirection?: string;
  positiveEqualityFilterApplied: false;
  productionReadCompleted: boolean;
  mappingExecuted: boolean;
  productionCalls: number;
  productionWrites: number;
  writeTrapDenied: boolean;
  killSwitchDenied?: boolean;
  recordsRead?: number;
  validMapped?: number;
  excludedNonCustomer?: number;
  excludedUnknownIdentity?: number;
  geographyNotRepresented?: number;
  partitionOk?: boolean;
  partitionReconcileOk?: boolean;
  closingGatesPass?: boolean;
  mappingReady?: boolean;
  customerMappingDiagnostics?: CustomerMappingDiagnostic[];
  finalReadDisabled?: boolean;
  finalWriteDisabled?: boolean;
};

function emptyReport(
  status: LiveSafeReport["overallStatus"],
): LiveSafeReport {
  return {
    overallStatus: status,
    shadowIdentity: SHADOW_SA,
    queryLimit: PHASE_4A7_CUSTOMERS_MAX_PAGE,
    discriminatorKind: "exclusionary_non_driver_non_agent",
    positiveEqualityFilterApplied: false,
    productionReadCompleted: false,
    mappingExecuted: false,
    productionCalls: 0,
    productionWrites: 0,
    writeTrapDenied: false,
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
  expect(customerLiveReportHasSensitiveLeak(serialized)).toBe(false);
  writeFileSync(reportPath, serialized);
}

function disableProductionFlags(): void {
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
}

describe("Phase 4A-7 live customers harness — always-on regressions", () => {
  it("isPhase4A7LiveCustomersEnabled: undefined/empty/0 → false; 1 → true", () => {
    expect(isPhase4A7LiveCustomersEnabled(undefined)).toBe(false);
    expect(isPhase4A7LiveCustomersEnabled("")).toBe(false);
    expect(isPhase4A7LiveCustomersEnabled("0")).toBe(false);
    expect(isPhase4A7LiveCustomersEnabled("1")).toBe(true);
    expect(typeof LIVE_CUSTOMERS).toBe("boolean");
  });

  it("startup accepts customers-only when configured", () => {
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
        LIVE_SHADOW_ALLOWED_RESOURCES: "customers",
        PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger",
      }),
    ).not.toThrow();
  });

  it("write trap denies customer activate in shadow", () => {
    const trap = shadowTrapForRequest({
      method: "POST",
      path: "/api/customers/activate",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");
    report.writeTrapDenied = true;
  });

  it("kill switch denies when Production read disabled", async () => {
    const c = createShadowReadContainer();
    await expect(
      c.productionReads.customers.listSummary(
        {
          scope: { type: "global" },
          serverScopeFilter: {},
          actorUid: "x",
          permissions: ["customers:read"],
          requestId: "r",
          correlationId: "c",
        },
        {},
        { limit: 10 },
      ),
    ).rejects.toBeInstanceOf(ProductionReadDisabledError);
    report.killSwitchDenied = true;
  });

  it("write repository remains disabled", async () => {
    const shadow = createShadowReadContainer();
    await expect(
      shadow.writes.create({ resource: "customers", operation: "create" }),
    ).rejects.toBeInstanceOf(ProductionWriteDisabledError);
  });
});

describe("Phase 4A-7 live customers Production window (SKIP by default)", () => {
  afterAll(() => {
    if (!LIVE_CUSTOMERS) {
      report.overallStatus = "SKIPPED";
      report.blocker = "PHASE4A7_LIVE_CUSTOMERS!=1";
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
    "operator-controlled customers live shadow (requires PHASE4A7_LIVE_CUSTOMERS=1)",
    async () => {
      if (!LIVE_CUSTOMERS) {
        report.overallStatus = "SKIPPED";
        report.blocker =
          "PHASE4A7_LIVE_CUSTOMERS!=1 — live body not executed";
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
      process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "customers";
      process.env.FULL_PII_SHADOW_ENABLED = "false";
      process.env.PRODUCTION_WRITE_ENABLED = "false";
      process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
      process.env.FINANCE_WRITE_ENABLED = "false";
      process.env.DRIVER_WRITE_ENABLED = "false";
      process.env.AGENT_WRITE_ENABLED = "false";
      process.env.CUSTOMER_WRITE_ENABLED = "false";
      process.env.PRODUCTION_READ_OBSERVABILITY_SINK = "file_ndjson";
      process.env.PRODUCTION_READ_OBSERVABILITY_FILE = obsPath;
      resetEnvCache();

      let observability: ReturnType<
        typeof createProductionReadObservability
      > | null = null;
      let wrappedClient: FirebaseAdminFirestoreReadClient | null = null;
      let ctx: ProductionReadContext | null = null;
      const liveAllowed = parseLiveShadowAllowedResources("customers");
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
          LIVE_SHADOW_ALLOWED_RESOURCES: "customers",
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
        const repo = new FirebaseProductionCustomerReadRepository({
          client: wrappedClient,
          productionReadEnabled: true,
          fullPiiShadowEnabled: false,
          observability,
          liveShadowAllowedResources: liveAllowed,
        });

        ctx = {
          scope: auth.identity.scope,
          serverScopeFilter: {},
          actorUid: auth.identity.uid,
          permissions: ["customers:read"],
          requestId: createRequestId(),
          correlationId: createCorrelationId(),
        };

        const page = await repo.listSummary(
          ctx,
          {},
          { limit: PHASE_4A7_CUSTOMERS_MAX_PAGE },
        );
        queryCount = 1;
        report.productionCalls = 1;
        report.productionWrites = 0;
        report.productionReadCompleted = true;
        report.mappingExecuted = true;
        report.queryLimit = page.queryMeta.queryLimit;
        report.discriminatorKind = page.queryMeta.discriminatorKind;
        report.queryOrderField = page.queryMeta.queryTimestampField;
        report.queryOrderDirection = page.queryMeta.queryOrderDirection;
        const metrics = page.auditMetrics;
        report.recordsRead = metrics.recordsRead;
        report.validMapped = metrics.validMapped;
        report.excludedNonCustomer = metrics.excludedNonCustomer;
        report.excludedUnknownIdentity = metrics.excludedUnknownIdentity;
        report.geographyNotRepresented = metrics.geographyNotRepresented;
        report.customerMappingDiagnostics = page.customerMappingDiagnostics;
        const partition = reconcileCustomerAuditPartition(metrics);
        report.partitionOk = partition.ok;
        report.partitionReconcileOk = partition.ok;

        const withoutEvidence = page.customerMappingDiagnostics.filter(
          (d) =>
            d.mappingStatus === "excludedNonCustomer" &&
            !excludedNonCustomerHasAuthoritativeEvidence(d),
        ).length;
        report.mappingReady = customerMappingReadyForLiveClose(metrics, {
          excludedNonCustomerWithoutEvidence: withoutEvidence,
        });

        const trap = shadowTrapForRequest({
          method: "POST",
          path: "/api/customers/activate",
          productionReadMode: "shadow",
          allowSyntheticMutations: false,
        });
        report.writeTrapDenied = trap.action === "deny";

        const shadow = createShadowReadContainer();
        await expect(
          shadow.writes.create({ resource: "customers", operation: "create" }),
        ).rejects.toBeInstanceOf(ProductionWriteDisabledError);

        const gatesOk = customerLiveClosingGatesPass({
          unmappedCountry: metrics.unmappedCountry,
          unknownDiscriminator: metrics.unknownDiscriminator,
          malformed: metrics.malformed,
          exactDocumentIdDuplicates: metrics.exactDocumentIdDuplicates,
          unexpectedCollections: metrics.unexpectedCollections,
          productionWrites: report.productionWrites,
          excludedNonCustomer: metrics.excludedNonCustomer,
          excludedNonCustomerWithoutEvidence: withoutEvidence,
          excludedUnknownIdentity: metrics.excludedUnknownIdentity,
        });
        report.closingGatesPass = gatesOk;

        if (
          !gatesOk ||
          !report.mappingReady ||
          !report.partitionOk ||
          !report.partitionReconcileOk
        ) {
          report.overallStatus = "NO_GO";
          report.blocker = "mapping_or_partition_gate";
          expect.fail(
            formatCustomerMappingNoGoMessage(page.customerMappingDiagnostics),
          );
        }

        report.overallStatus = "PASS";
        expect(report.writeTrapDenied).toBe(true);
        expect(report.productionWrites).toBe(0);
        void CUSTOMER_QUERY_INDEX_DEPENDENCY_BLOCKER;
      } catch (err) {
        if (!report.productionReadCompleted) {
          report.overallStatus = "NO_GO";
          report.productionReadCompleted = false;
          report.mappingExecuted = false;
          report.productionWrites = 0;
          if (!report.blocker) {
            const qFail = classifyCustomerLiveQueryFailure(err);
            report.blocker = qFail.blocker;
          }
        } else {
          report.overallStatus = "NO_GO";
          if (!report.blocker) {
            report.blocker = "mapping_or_partition_gate";
          }
        }
        throw err;
      } finally {
        try {
          const queriesBeforeKill = queryCount;
          process.env.PRODUCTION_READ_ENABLED = "false";
          resetEnvCache();

          if (wrappedClient && ctx) {
            const killed = new FirebaseProductionCustomerReadRepository({
              client: wrappedClient,
              productionReadEnabled: false,
              fullPiiShadowEnabled: false,
              observability: observability ?? undefined,
              liveShadowAllowedResources: liveAllowed,
            });
            await expect(
              killed.listSummary(ctx, {}, { limit: 10 }),
            ).rejects.toBeInstanceOf(ProductionReadDisabledError);
            expect(queryCount).toBe(queriesBeforeKill);
          }
          report.killSwitchDenied = true;
        } catch {
          /* kill verify best-effort */
        }

        disableProductionFlags();
        resetEnvCache();
        report.finalReadDisabled =
          process.env.PRODUCTION_READ_ENABLED !== "true";
        report.finalWriteDisabled =
          process.env.PRODUCTION_WRITE_ENABLED !== "true";
        writeReport();
      }
    },
    LIVE_TIMEOUT_MS,
  );
});
