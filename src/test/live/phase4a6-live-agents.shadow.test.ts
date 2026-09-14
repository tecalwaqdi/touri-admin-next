// @vitest-environment node
/**
 * Phase 4A-6 controlled live agents-only shadow read harness.
 * Ephemeral env only — never commits Production Read enablement.
 *
 * Run (agents — operator only; do NOT auto-enable in CI / agents):
 *   PHASE4A6_LIVE_AGENTS=1 FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/phase4a6-live-agents.shadow.test.ts
 *
 * DEFAULT: live `it` body returns early unless PHASE4A6_LIVE_AGENTS=1.
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
  FirebaseProductionAgentReadRepository,
  PHASE_4A6_AGENTS_MAX_PAGE,
} from "@/infrastructure/production/repositories/FirebaseProductionAgentReadRepository";
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
  agentMappingReadyForLiveClose,
  reconcileAgentAuditPartition,
} from "@/domain/agent/AgentDuplicateIdentityAudit";
import {
  agentLiveClosingGatesPass,
  agentLiveReportHasSensitiveLeak,
  excludedNonAgentHasAuthoritativeEvidence,
  formatAgentMappingNoGoMessage,
  type AgentMappingDiagnostic,
} from "@/domain/agent/AgentMappingDiagnostic";
import { isPhase4A6LiveAgentsEnabled } from "@/domain/agent/isPhase4A6LiveAgentsEnabled";
import {
  AGENT_QUERY_INDEX_DEPENDENCY_BLOCKER,
  classifyAgentLiveQueryFailure,
} from "@/domain/agent/AgentLiveQueryFailure";
import { createShadowReadContainer } from "@/infrastructure/production/container/createContainers";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";

const LIVE_AGENTS = isPhase4A6LiveAgentsEnabled(
  process.env.PHASE4A6_LIVE_AGENTS,
);
const PROJECT_ID = "tutorial-multi-language-70gx4j";
const SHADOW_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com";
const LIVE_TIMEOUT_MS = 30_000;

const reportDir = join(process.cwd(), ".local", "phase4a6-live");
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
  queryOrderField?: string;
  queryOrderDirection?: string;
  /** true only after Agent list query returned docs (or empty page) without throw. */
  productionReadCompleted: boolean;
  /** true only after mapping/audit ran on returned docs. */
  mappingExecuted: boolean;
  recordsRead: number;
  agentCandidates: number;
  validMapped: number;
  testOrNoncanonical: number;
  excludedNonAgent: number;
  unmappedCountry: number;
  malformed: number;
  unknownDiscriminator: number;
  activeOperationalDuplicates: number;
  unexpectedCollections: number;
  exactDocumentIdDuplicates: number;
  countriesWithMultipleActiveAgents: number;
  countriesWithOneActiveAgent: number;
  countriesWithNoAgent: number;
  activeAgentsPerCountry: Record<string, number>;
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
  diagnostics: AgentMappingDiagnostic[];
};

function emptyReport(status: LiveSafeReport["overallStatus"]): LiveSafeReport {
  return {
    overallStatus: status,
    shadowIdentity: SHADOW_SA,
    queryLimit: 0,
    discriminatorField: "Isagent",
    queryOrderField: "__name__",
    queryOrderDirection: "asc",
    productionReadCompleted: false,
    mappingExecuted: false,
    recordsRead: 0,
    agentCandidates: 0,
    validMapped: 0,
    testOrNoncanonical: 0,
    excludedNonAgent: 0,
    unmappedCountry: 0,
    malformed: 0,
    unknownDiscriminator: 0,
    activeOperationalDuplicates: 0,
    unexpectedCollections: 0,
    exactDocumentIdDuplicates: 0,
    countriesWithMultipleActiveAgents: 0,
    countriesWithOneActiveAgent: 0,
    countriesWithNoAgent: 0,
    activeAgentsPerCountry: {},
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
  expect(agentLiveReportHasSensitiveLeak(serialized)).toBe(false);
  writeFileSync(reportPath, serialized);
}

function disableProductionFlags(): void {
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
}

describe("Phase 4A-6 live agents harness — always-on regressions", () => {
  it("isPhase4A6LiveAgentsEnabled: undefined/empty/0 → false; 1 → true", () => {
    expect(isPhase4A6LiveAgentsEnabled(undefined)).toBe(false);
    expect(isPhase4A6LiveAgentsEnabled("")).toBe(false);
    expect(isPhase4A6LiveAgentsEnabled("0")).toBe(false);
    expect(isPhase4A6LiveAgentsEnabled("1")).toBe(true);
    expect(typeof LIVE_AGENTS).toBe("boolean");
  });

  it("startup accepts agents-only when configured", () => {
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
        LIVE_SHADOW_ALLOWED_RESOURCES: "agents",
        PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger",
      }),
    ).not.toThrow();
  });

  it("write trap denies agent activate in shadow", () => {
    const trap = shadowTrapForRequest({
      method: "POST",
      path: "/api/agents/activate",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");
    report.writeTrapDenied = true;
  });

  it("kill switch denies when Production read disabled", async () => {
    const c = createShadowReadContainer();
    await expect(
      c.productionReads.agents.list(
        {
          scope: { type: "global" },
          serverScopeFilter: {},
          actorUid: "x",
          permissions: ["agents:read"],
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

describe("Phase 4A-6 live agents Production window (SKIP by default)", () => {
  afterAll(() => {
    if (!LIVE_AGENTS) {
      report.overallStatus = "SKIPPED";
      report.blocker = "PHASE4A6_LIVE_AGENTS!=1";
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
    "operator-controlled agents live shadow (requires PHASE4A6_LIVE_AGENTS=1)",
    async () => {
      if (!LIVE_AGENTS) {
        report.overallStatus = "SKIPPED";
        report.blocker = "PHASE4A6_LIVE_AGENTS!=1 — live body not executed";
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
      process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "agents";
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
      const liveAllowed = parseLiveShadowAllowedResources("agents");
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
          LIVE_SHADOW_ALLOWED_RESOURCES: "agents",
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
        const repo = new FirebaseProductionAgentReadRepository({
          client: wrappedClient,
          productionReadEnabled: true,
          observability,
          liveShadowAllowedResources: liveAllowed,
        });

        ctx = {
          scope: auth.identity.scope,
          serverScopeFilter: {},
          actorUid: auth.identity.uid,
          permissions: ["agents:read"],
          requestId: createRequestId(),
          correlationId: createCorrelationId(),
        };

        const page = await repo.list(
          ctx,
          {},
          { limit: PHASE_4A6_AGENTS_MAX_PAGE },
        );
        queryCount = 1;
        report.productionCalls = 1;
        report.productionWrites = 0;
        report.productionReadCompleted = true;
        report.mappingExecuted = true;
        report.queryLimit = page.queryMeta.queryLimit;
        report.discriminatorField = page.queryMeta.discriminatorField;
        report.queryOrderField = page.queryMeta.queryTimestampField;
        report.queryOrderDirection = page.queryMeta.queryOrderDirection;
        const metrics = page.auditMetrics;
        report.recordsRead = metrics.recordsRead;
        report.agentCandidates = metrics.agentCandidates;
        report.validMapped = metrics.validMapped;
        report.testOrNoncanonical = metrics.testOrNoncanonical;
        report.excludedNonAgent = metrics.excludedNonAgent;
        report.unmappedCountry = metrics.unmappedCountry;
        report.malformed = metrics.malformed;
        report.unknownDiscriminator = metrics.unknownDiscriminator;
        report.activeOperationalDuplicates =
          metrics.activeOperationalDuplicates;
        report.unexpectedCollections = metrics.unexpectedCollections;
        report.exactDocumentIdDuplicates = metrics.exactDocumentIdDuplicates;
        report.countriesWithMultipleActiveAgents =
          metrics.countriesWithMultipleActiveAgents.length;
        report.countriesWithOneActiveAgent =
          metrics.countriesWithOneActiveAgent.length;
        report.countriesWithNoAgent = metrics.countriesWithNoAgent.length;
        report.activeAgentsPerCountry = metrics.activeAgentsPerCountry;
        report.diagnostics = page.agentMappingDiagnostics;
        report.partitionReconcileOk =
          reconcileAgentAuditPartition(metrics).ok;

        const withoutEvidence = page.agentMappingDiagnostics.filter(
          (d) =>
            d.mappingStatus === "excludedNonAgent" &&
            !excludedNonAgentHasAuthoritativeEvidence(d),
        ).length;
        report.mappingReadyForLiveClose = agentMappingReadyForLiveClose(
          metrics,
          { excludedNonAgentWithoutEvidence: withoutEvidence },
        );

        const trap = shadowTrapForRequest({
          method: "POST",
          path: "/api/agents/activate",
          productionReadMode: "shadow",
          allowSyntheticMutations: false,
        });
        report.writeTrapDenied = trap.action === "deny";

        const shadow = createShadowReadContainer();
        await expect(
          shadow.writes.create({ resource: "agents", operation: "create" }),
        ).rejects.toBeInstanceOf(ProductionWriteDisabledError);

        const gatesOk = agentLiveClosingGatesPass({
          unmappedCountry: metrics.unmappedCountry,
          unknownDiscriminator: metrics.unknownDiscriminator,
          malformed: metrics.malformed,
          activeOperationalDuplicates: metrics.activeOperationalDuplicates,
          exactDocumentIdDuplicates: metrics.exactDocumentIdDuplicates,
          unexpectedCollections: metrics.unexpectedCollections,
          productionWrites: report.productionWrites,
          excludedNonAgent: metrics.excludedNonAgent,
          excludedNonAgentWithoutEvidence: withoutEvidence,
          countriesWithMultipleActiveAgents:
            metrics.countriesWithMultipleActiveAgents.length,
        });

        if (
          !gatesOk ||
          !report.mappingReadyForLiveClose ||
          !report.partitionReconcileOk
        ) {
          report.overallStatus = "NO_GO";
          report.blocker = "mapping_or_one_active_agent_gate";
          report.mappingReadyForLiveClose = false;
          expect.fail(
            formatAgentMappingNoGoMessage(page.agentMappingDiagnostics),
          );
        }

        report.overallStatus = "PASS";
        expect(report.writeTrapDenied).toBe(true);
        expect(report.productionWrites).toBe(0);
        expect(report.countriesWithMultipleActiveAgents).toBe(0);
      } catch (err) {
        // Query/infra failure before docs ≠ mapping failure. Never leave stale PASS.
        if (!report.productionReadCompleted) {
          report.overallStatus = "NO_GO";
          report.productionReadCompleted = false;
          report.mappingExecuted = false;
          report.mappingReadyForLiveClose = false;
          report.productionWrites = 0;
          if (!report.blocker) {
            const qFail = classifyAgentLiveQueryFailure(err);
            report.blocker = qFail.blocker;
            void AGENT_QUERY_INDEX_DEPENDENCY_BLOCKER;
          }
        } else {
          report.overallStatus = "NO_GO";
          if (!report.blocker) {
            report.blocker = "mapping_or_one_active_agent_gate";
          }
        }
        throw err;
      } finally {
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
            const killed = new FirebaseProductionAgentReadRepository({
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
