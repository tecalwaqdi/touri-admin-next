// @vitest-environment node
/**
 * Finance FR4 Settlement Approval pilot apply harness — REAL operator-controlled 4-write path.
 * DEFAULT: SKIP unless FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY=1.
 *
 * When armed: DO NOT disableWriteFlags before live apply (FR1 lesson).
 * Cleanup env in afterAll AFTER live execution.
 *
 * Operator (ONE live session — not this preparation task):
 *   FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY=1 \
 *   FINANCE_WRITE_ENABLED=true \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=false \
 *   PRODUCTION_WRITE_ENABLED=false \
 *   DRIVER_WRITE_ENABLED=false \
 *   AGENT_WRITE_ENABLED=false \
 *   CUSTOMER_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *   SOURCE=fr2_settlement_draft \
 *   FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/finance-fr4-settlement-approval-pilot-apply.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { isFinanceFr4SettlementApprovalPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr4SettlementApprovalPilotApplyEnabled";
import { runFinanceFr4SettlementApprovalPilotApply } from "@/application/finance/pilot/FinanceFr4PilotApply";
import { prepareFinanceFr4SettlementApprovalPilot } from "@/application/finance/pilot/FinanceFr4PilotPreparation";
import {
  FINANCE_FR4_APPLY_SAFE_SUMMARY_PATH,
  FINANCE_FR4_EXPECTED_PROJECT_ID,
  FINANCE_FR4_PREP_SAFE_SUMMARY_PATH,
  FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS,
  FINANCE_FR4_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";
import { FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr4PilotIamDerivation";
import {
  emptyFinanceFr4ApplySafeSummary,
  type FinanceFr4ApplySafeSummary,
} from "@/application/finance/pilot/FinanceFr4ApplySafeSummary";
import { createFirebaseFinanceFr4ApplyFirestorePort } from "@/application/finance/pilot/FinanceFr4ProductionWriteAdapters";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyFinanceFr4PilotLiveWriteEnvironment,
  captureFinanceFr4PilotOperatorLiveGates,
  envForFinanceFr4VerifiedActorResolution,
  loadFinanceFr4PilotLiveWriteEnv,
  readFinanceFr4PilotOperatorGatesFromEnv,
} from "@/test/helpers/financeFr4PilotOperatorLiveEnv";
import { resetEnvCache } from "@/config/env";
import { resolveProductionVerifiedActor } from "@/infrastructure/auth/productionVerifiedAuth";
import type { FinanceFr4ApplyActor } from "@/application/finance/pilot/FinanceFr4ApplyPorts";

const LIVE = isFinanceFr4SettlementApprovalPilotApplyEnabled(
  process.env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY,
);

/** Capture write gates at module load — BEFORE beforeEach wipe. */
const OPERATOR_LIVE_GATES = captureFinanceFr4PilotOperatorLiveGates(
  process.env,
);

const reportDir = join(process.cwd(), ".local", "finance-fr4-pilot");
const reportPath = join(process.cwd(), FINANCE_FR4_APPLY_SAFE_SUMMARY_PATH);
const prepReportPath = join(process.cwd(), FINANCE_FR4_PREP_SAFE_SUMMARY_PATH);

let report: FinanceFr4ApplySafeSummary = emptyFinanceFr4ApplySafeSummary({
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
  const prep = prepareFinanceFr4SettlementApprovalPilot();
  const serialized = JSON.stringify(
    {
      fr4PrepStatus: prep.fr4PrepStatus,
      goNoGo: prep.goNoGo,
      goNoGoReasons: prep.goNoGoReasons,
      exactTransition: prep.exactTransition,
      allowedFieldMutations: prep.allowedFieldMutations,
      lockedApprovalExpectations: prep.lockedApprovalExpectations,
      calculatedApproval: prep.calculatedApproval,
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
  process.env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY = "";
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

describe("Finance FR4 Settlement Approval pilot apply harness (SKIP default; operator-executable when armed)", () => {
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
    "defaults SKIP; when armed runs real FR2 draft → approval/lock path",
    async () => {
      expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
      writePrepSummary();

      if (!LIVE) {
        const r = await runFinanceFr4SettlementApprovalPilotApply({
          mode: "preparation",
        });
        expect(r.status).toBe("REFUSED_PREP");
        expect(r.productionWrites).toBe(0);
        expect(r.writeCounts).toEqual(FINANCE_FR4_ZERO_WRITE_COUNTS);
        report = {
          ...r.summary,
          overallStatus: "PENDING_OPERATOR",
          blocker:
            "PENDING_OPERATOR — harness not armed; apply path implemented; offline Fake PASS in unit tests; no Production FR4 Settlement Approval pilot this session",
        };
        writeSafeReport();
        return;
      }

      // Armed path — DO NOT disableWriteFlags before live apply.
      const tokenBeforeEnv = process.env.FIREBASE_ID_TOKEN?.trim() ?? "";
      applyFinanceFr4PilotLiveWriteEnvironment({
        capturedGates: OPERATOR_LIVE_GATES,
      });
      expect(process.env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY).toBe("1");
      expect(process.env.FINANCE_WRITE_ENABLED).toBe("true");
      expect(process.env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.DRIVER_WRITE_ENABLED).toBe("false");
      expect(process.env.SOURCE).toBe("fr2_settlement_draft");
      expect(process.env.FIREBASE_ID_TOKEN?.trim() ?? "").toBe(tokenBeforeEnv);
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();

      const gateEnv = readFinanceFr4PilotOperatorGatesFromEnv();
      const env = loadFinanceFr4PilotLiveWriteEnv();
      expect(env.APP_ENV).toBe("production");
      expect(env.FINANCE_WRITE_ENABLED).toBe(true);
      expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
      expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);

      let actor: FinanceFr4ApplyActor | null = null;
      const token = tokenBeforeEnv || process.env.FIREBASE_ID_TOKEN?.trim() || "";
      if (token) {
        const auth = await resolveProductionVerifiedActor(
          token,
          envForFinanceFr4VerifiedActorResolution(env),
        );
        if (auth.ok) {
          actor = {
            uid: auth.identity.uid,
            role: auth.identity.role,
            permissions: auth.identity.permissions as string[],
          };
        }
      }

      const port = await createFirebaseFinanceFr4ApplyFirestorePort({
        projectId: FINANCE_FR4_EXPECTED_PROJECT_ID,
      });

      const r = await runFinanceFr4SettlementApprovalPilotApply({
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
        FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS,
        "ALREADY_APPLIED",
        "CONFLICT_NO_GO",
        "IAM_PREFLIGHT_FAILED",
        "VERIFICATION_FAILED",
        "REFUSED_GATES",
      ]).toContain(r.status);

      if (r.status === FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS) {
        expect(r.productionWrites).toBe(4);
        expect(r.summary.actualSettlementUpdates).toBe(1);
        expect(r.summary.actualSettlementCreates).toBe(0);
        expect(r.summary.actualAuditIntentWrites).toBe(1);
        expect(r.summary.actualAuditResultWrites).toBe(1);
        expect(r.summary.actualIdempotencyWrites).toBe(1);
        expect(r.summary.snapshotWrites).toBe(0);
        expect(r.summary.paymentWrites).toBe(0);
        expect(r.summary.verificationPass).toBe(true);
        expect(r.summary.forbiddenWritesZero).toBe(true);
      }
      if (r.status === "ALREADY_APPLIED") {
        expect(r.productionWrites).toBe(0);
      }

      void FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS;
    },
    180_000,
  );

  it("preserves FINANCE_FR4 apply arm through sanitization; never write flags globally", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });
});
