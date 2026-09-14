// @vitest-environment node
/**
 * Finance FR6 Adjustment pilot apply harness —
 * REAL operator-controlled 4-write append-only path.
 * DEFAULT: SKIP unless FINANCE_FR6_ADJUSTMENT_PILOT_APPLY=1.
 *
 * When armed: DO NOT disableWriteFlags before live apply (FR1 lesson).
 * Cleanup env in afterAll AFTER live execution.
 *
 * Operator (ONE live session — not this preparation task):
 *   FINANCE_FR6_ADJUSTMENT_PILOT_APPLY=1 \
 *   FINANCE_WRITE_ENABLED=true \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=false \
 *   PRODUCTION_WRITE_ENABLED=false \
 *   DRIVER_WRITE_ENABLED=false \
 *   AGENT_WRITE_ENABLED=false \
 *   CUSTOMER_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *   SOURCE=fr5_settlement_settled \
 *   FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/finance-fr6-adjustment-pilot-apply.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { isFinanceFr6AdjustmentPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr6AdjustmentPilotApplyEnabled";
import { runFinanceFr6AdjustmentPilotApply } from "@/application/finance/pilot/FinanceFr6PilotApply";
import { prepareFinanceFr6AdjustmentPilot } from "@/application/finance/pilot/FinanceFr6PilotPreparation";
import {
  FINANCE_FR6_APPLY_SAFE_SUMMARY_PATH,
  FINANCE_FR6_EXPECTED_PROJECT_ID,
  FINANCE_FR6_PREP_SAFE_SUMMARY_PATH,
  FINANCE_FR6_ADJUSTMENT_PILOT_PASS,
  FINANCE_FR6_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";
import { FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr6PilotIamDerivation";
import {
  emptyFinanceFr6ApplySafeSummary,
  type FinanceFr6ApplySafeSummary,
} from "@/application/finance/pilot/FinanceFr6ApplySafeSummary";
import { createFirebaseFinanceFr6ApplyFirestorePort } from "@/application/finance/pilot/FinanceFr6ProductionWriteAdapters";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyFinanceFr6PilotLiveWriteEnvironment,
  captureFinanceFr6PilotOperatorLiveGates,
  envForFinanceFr6VerifiedActorResolution,
  loadFinanceFr6PilotLiveWriteEnv,
  readFinanceFr6PilotOperatorGatesFromEnv,
} from "@/test/helpers/financeFr6PilotOperatorLiveEnv";
import { resetEnvCache } from "@/config/env";
import { resolveProductionVerifiedActor } from "@/infrastructure/auth/productionVerifiedAuth";
import type { FinanceFr6ApplyActor } from "@/application/finance/pilot/FinanceFr6ApplyPorts";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

const LIVE = isFinanceFr6AdjustmentPilotApplyEnabled(
  process.env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY,
);

/** Capture write gates at module load — BEFORE beforeEach wipe. */
const OPERATOR_LIVE_GATES = captureFinanceFr6PilotOperatorLiveGates(
  process.env,
);

const reportDir = join(process.cwd(), ".local", "finance-fr6-pilot");
const reportPath = join(process.cwd(), FINANCE_FR6_APPLY_SAFE_SUMMARY_PATH);
const prepReportPath = join(process.cwd(), FINANCE_FR6_PREP_SAFE_SUMMARY_PATH);

let report: FinanceFr6ApplySafeSummary = emptyFinanceFr6ApplySafeSummary({
  overallStatus: "PREP_SKIP",
  message: LIVE ? "armed — awaiting live apply" : "default skip",
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
  const prep = prepareFinanceFr6AdjustmentPilot();
  const serialized = JSON.stringify(
    {
      fr6PrepStatus: prep.fr6PrepStatus,
      goNoGo: prep.goNoGo,
      livePathDecisions: prep.livePathDecisions,
      exactExpectedWrites: prep.exactExpectedWrites,
      productionWritesThisSession: prep.productionWritesThisSession,
      oneShotLiveCommand: prep.oneShotLiveCommand,
      cleanupCommand: prep.cleanupCommand,
    },
    null,
    2,
  );
  writeFileSync(prepReportPath, serialized);
}

function disableWriteFlags(): void {
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY = "";
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

describe("Finance FR6 adjustment pilot apply harness (SKIP default; operator-executable when armed)", () => {
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
    "defaults SKIP; when armed runs real FR5 settled → append-only adjustment path",
    async () => {
      expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
      writePrepSummary();

      if (!LIVE) {
        const r = await runFinanceFr6AdjustmentPilotApply({
          mode: "preparation",
        });
        expect(r.status).toBe("PREP_SKIP");
        expect(r.productionWrites).toBe(0);
        expect(r.writeCounts).toEqual(FINANCE_FR6_ZERO_WRITE_COUNTS);
        report = emptyFinanceFr6ApplySafeSummary({
          overallStatus: "PREP_SKIP",
          message:
            "FINANCE_FR6_ADJUSTMENT_PILOT_APPLY!=1 — SKIP; offline Fake PASS in unit tests; no Production FR6 Adjustment pilot this session",
        });
        writeSafeReport();
        return;
      }

      // Armed path — DO NOT disableWriteFlags before live apply.
      const tokenBeforeEnv = process.env.FIREBASE_ID_TOKEN?.trim() ?? "";
      applyFinanceFr6PilotLiveWriteEnvironment({
        capturedGates: OPERATOR_LIVE_GATES,
      });
      expect(process.env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY).toBe("1");
      expect(process.env.FINANCE_WRITE_ENABLED).toBe("true");
      expect(process.env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.DRIVER_WRITE_ENABLED).toBe("false");
      expect(process.env.AGENT_WRITE_ENABLED).toBe("false");
      expect(process.env.CUSTOMER_WRITE_ENABLED).toBe("false");
      expect(process.env.SOURCE).toBe("fr5_settlement_settled");
      expect(process.env.EXPECTED_PROJECT_ID).toBe(FINANCE_FR6_EXPECTED_PROJECT_ID);
      expect(process.env.FIREBASE_ID_TOKEN?.trim() ?? "").toBe(tokenBeforeEnv);
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();

      const gateEnv = readFinanceFr6PilotOperatorGatesFromEnv();
      const env = loadFinanceFr6PilotLiveWriteEnv();
      expect(env.APP_ENV).toBe("production");
      expect(env.NODE_ENV).toBe("production");
      expect(env.EXPECTED_ENVIRONMENT).toBe("production");
      expect(env.AUTH_MODE).toBe("verified_token");
      expect(env.FINANCE_WRITE_ENABLED).toBe(true);
      expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
      expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);

      let actor: FinanceFr6ApplyActor | null = null;
      const token = tokenBeforeEnv || process.env.FIREBASE_ID_TOKEN?.trim() || "";
      if (token) {
        const auth = await resolveProductionVerifiedActor(
          token,
          envForFinanceFr6VerifiedActorResolution(env),
        );
        if (auth.ok) {
          actor = {
            uid: auth.identity.uid,
            role: auth.identity.role,
            permissions: auth.identity.permissions as FinancePermission[],
          };
        }
      }

      const port = await createFirebaseFinanceFr6ApplyFirestorePort({
        projectId: FINANCE_FR6_EXPECTED_PROJECT_ID,
      });

      const r = await runFinanceFr6AdjustmentPilotApply({
        mode: "live_apply",
        env: gateEnv,
        firestorePort: port,
        actor,
        actorResolver: actor
          ? undefined
          : {
              async resolve() {
                return null;
              },
            },
      });

      report = r.summary;
      writeSafeReport();

      expect([
        "APPLIED",
        "ALREADY_APPLIED",
        "CONFLICT_NO_GO",
        "IAM_DENIED",
        "RBAC_DENIED",
        "ACTOR_DENIED",
        "GATE_BLOCKED",
      ]).toContain(r.status);

      if (r.status === "APPLIED" || r.status === "ALREADY_APPLIED") {
        expect(r.passMarker).toBe(FINANCE_FR6_ADJUSTMENT_PILOT_PASS);
      }
      if (r.status === "APPLIED") {
        expect(r.productionWrites).toBe(4);
      }
      if (r.status === "ALREADY_APPLIED") {
        expect(r.productionWrites).toBe(0);
      }

      void FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS;
    },
    180_000,
  );

  it("preserves FINANCE_FR6 apply arm through sanitization; never write flags globally", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR6_ADJUSTMENT_PILOT_APPLY: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });
});
