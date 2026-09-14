// @vitest-environment node
/**
 * Phase 5J — Auth-safe synthetic Driver provision harness (REAL operator path).
 *
 * DEFAULT: SKIP unless PHASE5J_PROVISION_SYNTHETIC_DRIVER=1.
 * When armed: evaluate gates → IAM check-only preflight → at most ONE bounded provision.
 *
 * Global Vitest sanitization still clears write flags; this file alone captures
 * operator-supplied inline gates at module load and re-applies them when armed
 * (Phase 5G-style live env contract). Ordinary tests do not use that path.
 *
 * DO NOT auto-run provision in CI. Prefer SKIP.
 *
 * Operator (when IAM + approval ready — NOT this implementation session):
 *   PHASE5J_PROVISION_SYNTHETIC_DRIVER=1 \
 *   PHASE5I_PROVISION_SYNTHETIC_DRIVER=1 \
 *   SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED=true \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=true \
 *   PRODUCTION_WRITE_ENABLED=true \
 *   DRIVER_WRITE_ENABLED=true \
 *   AGENT_WRITE_ENABLED=false \
 *   CUSTOMER_WRITE_ENABLED=false \
 *   CUSTOMER_AUTH_WRITE_ENABLED=false \
 *   FINANCE_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *     npx vitest run src/test/live/phase5j-provision-synthetic-driver.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhase5JProvisionSyntheticDriverEnabled } from "@/application/controlled-writes/pilot/isPhase5JSyntheticDriverProvisionEnabled";
import { createSyntheticDriverProvisioningService } from "@/application/controlled-writes/pilot/SyntheticDriverProvisioningService";
import { PHASE_5J_EXPECTED_WRITE_COUNTS_DISABLED } from "@/application/controlled-writes/pilot/Phase5JExpectedWriteCounts";
import { runPhase5JIamPreflight } from "@/application/controlled-writes/pilot/Phase5JIamPreflight";
import { runPhase5JProvisionHarnessFlow } from "@/application/controlled-writes/pilot/Phase5JProvisionHarnessFlow";
import {
  emptyPhase5JHarnessSafeSummary,
  type Phase5JHarnessSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5JHarnessSafeSummary";
import { createFirebasePhase5JProvisioningPorts } from "@/application/controlled-writes/pilot/Phase5JFirebaseAdapters";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyPhase5JOperatorLiveEnvironment,
  capturePhase5JOperatorLiveGates,
  readPhase5JOperatorGatesFromEnv,
} from "@/test/helpers/phase5jOperatorLiveEnv";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";
import { resetEnvCache } from "@/config/env";

const HARNESS = isPhase5JProvisionSyntheticDriverEnabled(
  process.env.PHASE5J_PROVISION_SYNTHETIC_DRIVER,
);

/**
 * Capture operator inline write gates at module load — BEFORE beforeEach wipe.
 * Only used when HARNESS is armed; never preserved by global sanitization.
 */
const OPERATOR_LIVE_GATES = capturePhase5JOperatorLiveGates(process.env);

const reportDir = join(process.cwd(), ".local", "phase5j-fixture");
const reportPath = join(reportDir, "harness-safe-summary.json");

let report: Phase5JHarnessSafeSummary = emptyPhase5JHarnessSafeSummary({
  harnessArmed: HARNESS,
  overallStatus: HARNESS ? "GATED_REFUSED" : "SKIPPED",
});

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  expect(serialized).not.toMatch(/password|token|private_key|BEGIN PRIVATE/i);
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
  process.env.PHASE5I_PROVISION_SYNTHETIC_DRIVER = "";
  resetEnvCache();
}

describe("Phase 5J — provision harness (SKIP default; operator-executable when armed)", () => {
  afterAll(() => {
    disableWriteFlags();
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    try {
      if (existsSync(reportDir) || report.harnessArmed) {
        writeSafeReport();
      }
    } catch {
      /* ignore */
    }
  });

  it("default → SKIP; armed → gates → IAM → at most one bounded provision", async () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(PHASE_5J_EXPECTED_WRITE_COUNTS_DISABLED.authCreate).toBe(0);

    if (!HARNESS) {
      const flow = await runPhase5JProvisionHarnessFlow({
        harnessArmed: false,
      });
      expect(flow.summary.overallStatus).toBe("SKIPPED");
      expect(flow.summary.provisionAttempted).toBe(false);
      expect(flow.summary.authWrites).toBe(0);
      expect(flow.summary.firestoreWrites).toBe(0);
      expect(flow.summary.actualWrite).toBe(false);
      report = flow.summary;

      const svc = createSyntheticDriverProvisioningService();
      const r = await svc.provision();
      expect(r.ok).toBe(false);
      expect(r.actualWrite).toBe(false);
      if (!r.ok) expect(r.authWrites).toBe(0);
      return;
    }

    // Armed: re-apply operator inline gates wiped by global beforeEach.
    applyPhase5JOperatorLiveEnvironment(OPERATOR_LIVE_GATES);
    resetEnvCache();
    const gateEnv = readPhase5JOperatorGatesFromEnv();

    const flow = await runPhase5JProvisionHarnessFlow({
      harnessArmed: true,
      gates: gateEnv,
      runProvision: async () => {
        const ports = await createFirebasePhase5JProvisioningPorts({
          gates: gateEnv,
        });
        const svc = createSyntheticDriverProvisioningService({
          ports,
          persistRegistry: true,
        });
        return svc.provision({ gates: gateEnv });
      },
    });

    report = flow.summary;
    expect(flow.summary.harnessArmed).toBe(true);

    if (flow.summary.overallStatus === "GATED_REFUSED") {
      expect(flow.summary.provisionAttempted).toBe(false);
      expect(flow.summary.authWrites).toBe(0);
      expect(flow.summary.firestoreWrites).toBe(0);
      return;
    }

    if (flow.summary.overallStatus === "IAM_PREFLIGHT_FAILED") {
      expect(flow.summary.provisionAttempted).toBe(false);
      expect(flow.summary.actualWrite).toBe(false);
      expect(flow.summary.authCreateInvocationCount).toBe(0);
      expect(flow.summary.firestoreCreateInvocationCount).toBe(0);
      expect(flow.iam?.mutationsPerformed).toBe(0);
      expect(flow.iam?.iamChanges).toBe(0);
      return;
    }

    // IAM passed — exactly one provision attempt was allowed.
    expect(flow.summary.provisionAttempted).toBe(true);
    expect(flow.summary.authCreateInvocationCount).toBeLessThanOrEqual(1);
    expect(flow.summary.firestoreCreateInvocationCount).toBeLessThanOrEqual(1);
    expect(flow.summary.financeWrites).toBe(0);
    expect(flow.summary.tripWrites).toBe(0);
    expect(flow.summary.agentWrites).toBe(0);
    expect(flow.summary.customerWrites).toBe(0);
    if (flow.summary.overallStatus === "PILOT_READY") {
      expect(flow.summary.pilotReady).toBe(true);
      expect(flow.summary.authWrites).toBe(1);
      expect(flow.summary.firestoreWrites).toBe(1);
    }
  });

  it("IAM preflight remains check-only (mutations=0)", async () => {
    const pre = await runPhase5JIamPreflight({
      // Offline path: refuse SA keys / fail closed without mutating.
      permissionTester: {
        async testIamPermissions() {
          return [
            "firebaseauth.users.get",
            "datastore.entities.get",
          ];
        },
      },
      credentialProvider: {
        name: "HarnessOfflineIamCredential",
        async getCredentials() {
          return {
            projectId: "tutorial-multi-language-70gx4j",
            kind: "fake",
          };
        },
      },
    });
    expect(pre.mutationsPerformed).toBe(0);
    expect(pre.iamChanges).toBe(0);
    expect(pre.mode).toBe("check_only");
    expect(pre.authCreateAttempted).toBe(false);
    expect(pre.firestoreCreateAttempted).toBe(false);
    if (!pre.ok) {
      expect(pre.status).toBe("IAM_PREFLIGHT_FAILED");
      expect(pre.missingPermissions).toEqual(
        expect.arrayContaining([
          "firebaseauth.users.create",
          "datastore.entities.create",
        ]),
      );
    }
  });

  it("PHASE5J flag survives sanitization; write flags cleared globally; live capture restores for armed harness only", () => {
    const captured = captureOperatorHarnessEnv({
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: "1",
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: undefined,
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: undefined,
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: "1",
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5J_PROVISION_SYNTHETIC_DRIVER).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }

    // Scoped live contract: capture-before-wipe + apply restores operator gates.
    const liveCapture = capturePhase5JOperatorLiveGates({
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      AGENT_WRITE_ENABLED: "false",
      CUSTOMER_WRITE_ENABLED: "false",
      CUSTOMER_AUTH_WRITE_ENABLED: "false",
      FINANCE_WRITE_ENABLED: "false",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
    });
    applyPhase5JOperatorLiveEnvironment(liveCapture, env);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("true");
    expect(env.DRIVER_WRITE_ENABLED).toBe("true");
    expect(env.FINANCE_WRITE_ENABLED).toBe("false");
    expect(env.GOOGLE_CLOUD_PROJECT).toBe("tutorial-multi-language-70gx4j");
  });
});
