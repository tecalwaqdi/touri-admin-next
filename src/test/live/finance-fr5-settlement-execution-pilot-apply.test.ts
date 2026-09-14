// @vitest-environment node
/**
 * Finance FR5 Settlement Execution / Collection pilot apply harness —
 * REAL operator-controlled 5-write path.
 * DEFAULT: SKIP unless FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY=1.
 *
 * When armed: DO NOT disableWriteFlags before live apply (FR1 lesson).
 * Cleanup env in afterAll AFTER live execution.
 *
 * Operator (ONE live session — not this preparation task):
 *   FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY=1 \
 *   FINANCE_WRITE_ENABLED=true \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=false \
 *   PRODUCTION_WRITE_ENABLED=false \
 *   DRIVER_WRITE_ENABLED=false \
 *   AGENT_WRITE_ENABLED=false \
 *   CUSTOMER_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *   SOURCE=fr4_settlement_locked \
 *   FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/finance-fr5-settlement-execution-pilot-apply.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { isFinanceFr5SettlementExecutionPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr5SettlementExecutionPilotApplyEnabled";
import { runFinanceFr5SettlementExecutionPilotApply } from "@/application/finance/pilot/FinanceFr5PilotApply";
import { prepareFinanceFr5SettlementExecutionPilot } from "@/application/finance/pilot/FinanceFr5PilotPreparation";
import {
  FINANCE_FR5_APPLY_SAFE_SUMMARY_PATH,
  FINANCE_FR5_EXPECTED_PROJECT_ID,
  FINANCE_FR5_PREP_SAFE_SUMMARY_PATH,
  FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS,
  FINANCE_FR5_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import { FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr5PilotIamDerivation";
import {
  emptyFinanceFr5ApplySafeSummary,
  type FinanceFr5ApplySafeSummary,
} from "@/application/finance/pilot/FinanceFr5ApplySafeSummary";
import { createFirebaseFinanceFr5ApplyFirestorePort } from "@/application/finance/pilot/FinanceFr5ProductionWriteAdapters";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyFinanceFr5PilotLiveWriteEnvironment,
  captureFinanceFr5PilotOperatorLiveGates,
  envForFinanceFr5VerifiedActorResolution,
  loadFinanceFr5PilotLiveWriteEnv,
  readFinanceFr5PilotOperatorGatesFromEnv,
} from "@/test/helpers/financeFr5PilotOperatorLiveEnv";
import { resetEnvCache } from "@/config/env";
import { resolveProductionVerifiedActor } from "@/infrastructure/auth/productionVerifiedAuth";
import type { FinanceFr5ApplyActor } from "@/application/finance/pilot/FinanceFr5ApplyPorts";

const LIVE = isFinanceFr5SettlementExecutionPilotApplyEnabled(
  process.env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY,
);

/** Capture write gates at module load — BEFORE beforeEach wipe. */
const OPERATOR_LIVE_GATES = captureFinanceFr5PilotOperatorLiveGates(
  process.env,
);

const reportDir = join(process.cwd(), ".local", "finance-fr5-pilot");
const reportPath = join(process.cwd(), FINANCE_FR5_APPLY_SAFE_SUMMARY_PATH);
const prepReportPath = join(process.cwd(), FINANCE_FR5_PREP_SAFE_SUMMARY_PATH);

let report: FinanceFr5ApplySafeSummary = emptyFinanceFr5ApplySafeSummary({
  harnessArmed: LIVE,
  overallStatus: LIVE ? "PENDING_OPERATOR" : "SKIPPED",
});

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(serialized).not.toMatch(/password|private_key|BEGIN PRIVATE/i);
  expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  expect(serialized).not.toMatch(/FIREBASE_ID_TOKEN/);
  writeFileSync(reportPath, serialized);
}

function writePrepSummary(): void {
  mkdirSync(reportDir, { recursive: true });
  const prep = prepareFinanceFr5SettlementExecutionPilot();
  const serialized = JSON.stringify(
    {
      fr5PrepStatus: prep.fr5PrepStatus,
      goNoGo: prep.goNoGo,
      goNoGoReasons: prep.goNoGoReasons,
      canonicalMechanism: prep.canonicalMechanism,
      exactTransition: prep.exactTransition,
      exactExecutionDirection: prep.exactExecutionDirection,
      exactPaymentAmount: prep.exactPaymentAmount,
      allowedFieldMutations: prep.allowedFieldMutations,
      lockedExecutionExpectations: prep.lockedExecutionExpectations,
      calculatedExecution: prep.calculatedExecution
        ? {
            settlementId: prep.calculatedExecution.settlementId,
            paymentId: prep.calculatedExecution.paymentId,
            toStatus: prep.calculatedExecution.toStatus,
            paymentStatus: prep.calculatedExecution.paymentStatus,
            amountMinor: prep.calculatedExecution.amountMinor,
            paidConfirmedMinorAfter:
              prep.calculatedExecution.paidConfirmedMinorAfter,
            outstandingMinorAfter:
              prep.calculatedExecution.outstandingMinorAfter,
            direction: prep.calculatedExecution.direction,
            walletTouched: prep.calculatedExecution.walletTouched,
            payoutExecuted: prep.calculatedExecution.payoutExecuted,
          }
        : null,
      exactExpectedWrites: prep.exactExpectedWrites,
      requiredRbacPermission: prep.requiredRbacPermission,
      requiredIamPermissions: prep.requiredIamPermissions,
      expectedAdcPrincipal: prep.expectedAdcPrincipal,
      oneShotLiveCommand: prep.oneShotLiveCommand,
      cleanupCommand: prep.cleanupCommand,
      productionWritesThisSession: prep.productionWritesThisSession,
      financeWriteEnabled: prep.financeWriteEnabled,
      separationOfDuties: prep.separationOfDuties,
      prepChecklistPassCount: prep.prepChecklistPassCount,
    },
    null,
    2,
  );
  writeFileSync(prepReportPath, serialized);
}

function disableWriteFlags(): void {
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY = "";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.CUSTOMER_WRITE_ENABLED = "false";
  process.env.APP_ENV = "development";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  process.env.EXPECTED_ENVIRONMENT = "development";
  process.env.AUTH_MODE = "mock";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.SOURCE = "";
  Object.assign(process.env, { NODE_ENV: "test" });
  resetEnvCache();
}

describe("Finance FR5 Settlement Execution pilot apply harness (SKIP default; operator-executable when armed)", () => {
  afterAll(() => {
    disableWriteFlags();
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    try {
      writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it(
    "defaults SKIP; when armed runs real FR4 locked → settled collection path",
    async () => {
      expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
      writePrepSummary();

      if (!LIVE) {
        const r = await runFinanceFr5SettlementExecutionPilotApply({
          mode: "preparation",
        });
        expect(r.status).toBe("REFUSED_PREP");
        expect(r.productionWrites).toBe(0);
        expect(r.writeCounts).toEqual(FINANCE_FR5_ZERO_WRITE_COUNTS);
        report = {
          ...r.summary,
          overallStatus: "PENDING_OPERATOR",
          blocker:
            "PENDING_OPERATOR — harness not armed; apply path implemented; offline Fake PASS in unit tests; no Production FR5 Settlement Execution pilot this session",
        };
        writeSafeReport();
        return;
      }

      // Armed path — DO NOT disableWriteFlags before live apply.
      const tokenBeforeEnv = process.env.FIREBASE_ID_TOKEN?.trim() ?? "";
      applyFinanceFr5PilotLiveWriteEnvironment({
        capturedGates: OPERATOR_LIVE_GATES,
      });
      expect(process.env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY).toBe("1");
      expect(process.env.FINANCE_WRITE_ENABLED).toBe("true");
      expect(process.env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.DRIVER_WRITE_ENABLED).toBe("false");
      expect(process.env.SOURCE).toBe("fr4_settlement_locked");
      expect(process.env.FIREBASE_ID_TOKEN?.trim() ?? "").toBe(tokenBeforeEnv);
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();

      const gateEnv = readFinanceFr5PilotOperatorGatesFromEnv();
      const env = loadFinanceFr5PilotLiveWriteEnv();
      expect(env.APP_ENV).toBe("production");
      expect(env.FINANCE_WRITE_ENABLED).toBe(true);
      expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
      expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);

      let actor: FinanceFr5ApplyActor | null = null;
      const token = tokenBeforeEnv || process.env.FIREBASE_ID_TOKEN?.trim() || "";
      if (token) {
        const auth = await resolveProductionVerifiedActor(
          token,
          envForFinanceFr5VerifiedActorResolution(env),
        );
        if (auth.ok) {
          actor = {
            uid: auth.identity.uid,
            role: auth.identity.role,
            permissions: auth.identity.permissions as string[],
          };
        }
      }

      const port = await createFirebaseFinanceFr5ApplyFirestorePort({
        projectId: FINANCE_FR5_EXPECTED_PROJECT_ID,
      });

      const r = await runFinanceFr5SettlementExecutionPilotApply({
        mode: "live_apply",
        env: gateEnv,
        executeApply: true,
        firestorePort: port,
        actor,
        firebaseIdToken: token || null,
        actorResolver: actor
          ? undefined
          : {
              async resolve() {
                return { ok: false, reason: "TOKEN_MISSING" };
              },
            },
      });

      report = r.summary;
      writeSafeReport();

      expect([
        FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS,
        "ALREADY_APPLIED",
        "CONFLICT_NO_GO",
        "IAM_PREFLIGHT_FAILED",
        "VERIFICATION_FAILED",
        "REFUSED_GATES",
      ]).toContain(r.status);

      if (r.status === FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS) {
        expect(r.productionWrites).toBe(5);
        expect(r.summary.actualSettlementUpdates).toBe(1);
        expect(r.summary.actualSettlementCreates).toBe(0);
        expect(r.summary.actualPaymentCreates).toBe(1);
        expect(r.summary.actualAuditIntentWrites).toBe(1);
        expect(r.summary.actualAuditResultWrites).toBe(1);
        expect(r.summary.actualIdempotencyWrites).toBe(1);
        expect(r.summary.snapshotWrites).toBe(0);
        expect(r.summary.walletWrites).toBe(0);
        expect(r.summary.verificationPass).toBe(true);
        expect(r.summary.forbiddenWritesZero).toBe(true);
      }
      if (r.status === "ALREADY_APPLIED") {
        expect(r.productionWrites).toBe(0);
      }

      void FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS;
    },
    180_000,
  );

  it("preserves FINANCE_FR5 apply arm through sanitization; never write flags globally", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });
});
