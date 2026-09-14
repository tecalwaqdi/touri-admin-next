// @vitest-environment node
/**
 * Phase 5N — metadata reconciliation LIVE APPLY harness.
 *
 * DEFAULT: SKIP unless PHASE5N_METADATA_RECONCILE_APPLY=1.
 * When armed: gates → re-read preconditions → create-only success RESULT →
 * set(merge) idempotency result.auditResultId only → post-verify.
 *
 * NEVER RequestDriverChangesCommand. NEVER Driver/Auth/Finance writes.
 * THIS SESSION: do not arm. Do not grant IAM. Do not execute Production write.
 *
 * Operator (future — after IAM confirm):
 *   PHASE5N_METADATA_RECONCILE_APPLY=1 \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=true \
 *   PRODUCTION_WRITE_ENABLED=true \
 *   DRIVER_WRITE_ENABLED=false \
 *   AGENT_WRITE_ENABLED=false \
 *   CUSTOMER_WRITE_ENABLED=false \
 *   CUSTOMER_AUTH_WRITE_ENABLED=false \
 *   FINANCE_WRITE_ENABLED=false \
 *   SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *     npx vitest run src/test/live/phase5n-metadata-reconcile-apply.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhase5NMetadataReconcileApplyEnabled } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import { runPhase5NMetadataReconciliationApply } from "@/application/controlled-writes/pilot/Phase5NMetadataReconciliationApply";
import {
  emptyPhase5NApplySafeSummary,
  type Phase5NApplySafeSummary,
} from "@/application/controlled-writes/pilot/Phase5NApplySafeSummary";
import { createPhase5NProductionApplyPorts } from "@/application/controlled-writes/pilot/Phase5NProductionMetadataWriteAdapters";
import { PHASE_5N_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/controlled-writes/pilot/Phase5NIamDerivation";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyPhase5NLiveProductionWriteEnvironment,
  capturePhase5NOperatorLiveGates,
  PHASE_5N_EXPECTED_ADC_USER_PRINCIPAL,
  readPhase5NOperatorGatesFromEnv,
} from "@/test/helpers/phase5nOperatorLiveEnv";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";
import { resetEnvCache } from "@/config/env";
import {
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
} from "@/application/controlled-writes/pilot/Phase5NConstants";

const LIVE = isPhase5NMetadataReconcileApplyEnabled(
  process.env.PHASE5N_METADATA_RECONCILE_APPLY,
);

/** Capture write gates at module load — BEFORE beforeEach wipe. */
const OPERATOR_LIVE_GATES = capturePhase5NOperatorLiveGates(process.env);

const reportDir = join(process.cwd(), ".local", "phase5n-reconciliation");
const reportPath = join(reportDir, "apply-safe-summary.json");

let report: Phase5NApplySafeSummary = emptyPhase5NApplySafeSummary({
  harnessArmed: LIVE,
  overallStatus: LIVE ? "PENDING_OPERATOR" : "SKIPPED",
});

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  expect(serialized).not.toMatch(/password|private_key|BEGIN PRIVATE/i);
  expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  expect(serialized).not.toMatch(/"uid"\s*:/);
  expect(serialized).not.toMatch(/XZPLpmbFoOa0C4MeR5pL60SMESf2/);
  writeFileSync(reportPath, serialized);
}

function disableWriteFlags(): void {
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.CUSTOMER_WRITE_ENABLED = "false";
  process.env.CUSTOMER_AUTH_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED = "false";
  process.env.PHASE5M_DRIVER_PILOT_APPLY = "";
  process.env.PHASE5N_METADATA_RECONCILE_APPLY = "";
  process.env.APP_ENV = "development";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  process.env.EXPECTED_ENVIRONMENT = "development";
  process.env.AUTH_MODE = "mock";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
  Object.assign(process.env, { NODE_ENV: "test" });
  resetEnvCache();
}

describe("Phase 5N — metadata reconcile apply (SKIP default; operator-executable when armed)", () => {
  afterAll(() => {
    disableWriteFlags();
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    try {
      writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it(
    "defaults to SKIP; write flags false; no mutation",
    async () => {
      expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);

      if (!LIVE) {
        const r = await runPhase5NMetadataReconciliationApply({
          harnessArmed: false,
        });
        expect(r.summary.overallStatus).toBe("SKIPPED");
        expect(r.summary.productionWrites).toBe(0);
        expect(r.summary.applyAttempted).toBe(false);
        expect(r.summary.metadataWrites).toBe(0);
        expect(r.summary.driverDomainWrites).toBe(0);
        expect(r.domainCommandInvoked).toBe(false);
        expect(r.productionWriteInvoked).toBe(false);
        report = {
          ...r.summary,
          overallStatus: "PENDING_OPERATOR",
          blocker:
            "PENDING_OPERATOR — harness not armed; apply path implemented; offline Fake PASS in unit tests; no Production reconcile this session",
        };
        writeSafeReport();
        return;
      }

      // Armed path — construct Production metadata WRITE env BEFORE loadEnv().
      applyPhase5NLiveProductionWriteEnvironment({
        capturedGates: OPERATOR_LIVE_GATES,
      });
      expect(process.env.APP_ENV).toBe("production");
      expect(process.env.NODE_ENV).toBe("production");
      expect(process.env.DRIVER_WRITE_ENABLED).toBe("false");
      expect(process.env.PHASE5M_DRIVER_PILOT_APPLY).toBe("");
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();

      const gateEnv = readPhase5NOperatorGatesFromEnv();
      const ports = await createPhase5NProductionApplyPorts({ gates: gateEnv });

      const r = await runPhase5NMetadataReconciliationApply({
        harnessArmed: true,
        executeApply: true,
        ports,
        gates: gateEnv,
        liveApplyAttempted: true,
      });

      expect(r.domainCommandInvoked).toBe(false);
      expect(r.summary.driverDomainWrites).toBe(0);
      expect(r.summary.authClaimWrites).toBe(0);
      expect(r.summary.financeWrites).toBe(0);
      expect(r.summary.tripWrites).toBe(0);
      expect(r.summary.agentWrites).toBe(0);
      expect(r.summary.customerWrites).toBe(0);
      expect(r.summary.originalIdempotencyKeyLogical).toBe(
        PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
      );
      expect(r.summary.originalIntentAuditId).toBe(
        PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
      );

      report = r.summary;
      writeSafeReport();

      // Soft documentation — do not fail suite on IAM; operator inspects summary.
      void PHASE_5N_REQUIRED_OPERATOR_IAM_PERMISSIONS;
      void PHASE_5N_EXPECTED_ADC_USER_PRINCIPAL;
    },
    120_000,
  );

  it("preserves PHASE5N apply arm through sanitization; never write flags", () => {
    const captured = captureOperatorHarnessEnv({
      PHASE5N_METADATA_RECONCILE_APPLY: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5N_METADATA_RECONCILE_APPLY: undefined,
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5N_METADATA_RECONCILE_APPLY).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });
});
