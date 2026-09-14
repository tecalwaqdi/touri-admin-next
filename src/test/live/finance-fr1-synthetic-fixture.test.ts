// @vitest-environment node
/**
 * FR1 — Synthetic registry fixture provision harness (REAL create path when armed).
 *
 * DEFAULT: SKIP unless:
 *   FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE_DRY_RUN=1 → plan-only (0 writes)
 *   FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE=1         → operator live create
 *
 * Do NOT enable FINANCE_WRITE_ENABLED. Do NOT write order/.
 * Do NOT write finance_accounting_snapshots during provisioning.
 *
 * Operator (ONE live session — not this implementation task):
 *   FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE=1 \
 *     FINANCE_WRITE_ENABLED=false \
 *     GLOBAL_PRODUCTION_WRITE_ENABLED=false \
 *     PRODUCTION_WRITE_ENABLED=false \
 *     DRIVER_WRITE_ENABLED=false \
 *     AGENT_WRITE_ENABLED=false \
 *     CUSTOMER_WRITE_ENABLED=false \
 *     EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *     GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *     TARGET=registry \
 *     DOCUMENT_ID=test_adminnext_finance_fr1_completed_001 \
 *     IDEMPOTENCY_KEY=finance_fr1_create_synthetic_completed_order_fixture_v1 \
 *     npx vitest run src/test/live/finance-fr1-synthetic-fixture.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isFinanceFr1SyntheticFixtureCreateEnabled,
  isFinanceFr1SyntheticFixtureDryRunEnabled,
} from "@/application/finance/pilot/isFinanceFr1SyntheticFixtureCreateEnabled";
import {
  ORDER_TRIGGER_INSPECTION,
} from "@/application/finance/pilot/FinanceFr1OrderTriggerInspection";
import {
  FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS,
  FINANCE_FR1_SYNTHETIC_FIXTURE_CLEANUP_COMMAND,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_FR1_SYNTHETIC_FIXTURE_SAFE_SUMMARY_PATH,
  FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  evaluateFinanceFr1SyntheticFixtureCreateGate,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureCreateSemantics";
import { prepareFinanceFr1SyntheticFixture } from "@/application/finance/pilot/FinanceFr1SyntheticFixturePreparation";
import { runFinanceFr1RegistryFixtureProvision } from "@/application/finance/pilot/FinanceFr1RegistryFixtureProvision";
import { createFirebaseFinanceFr1RegistryFixtureFirestorePort } from "@/application/finance/pilot/FinanceFr1RegistryFixtureFirebaseAdapters";
import {
  emptyFinanceFr1RegistryFixtureProvisionSafeSummary,
  type FinanceFr1RegistryFixtureProvisionSafeSummary,
} from "@/application/finance/pilot/FinanceFr1RegistryFixtureProvisionSummary";
import {
  applyFinanceFr1FixtureOperatorLiveEnvironment,
  captureFinanceFr1FixtureOperatorLiveGates,
} from "@/test/helpers/financeFr1FixtureOperatorLiveEnv";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { resetEnvCache } from "@/config/env";

const CREATE = isFinanceFr1SyntheticFixtureCreateEnabled(
  process.env.FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE,
);
const DRY_RUN = isFinanceFr1SyntheticFixtureDryRunEnabled(
  process.env.FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE_DRY_RUN,
);

/** Capture operator inline gates at module load — BEFORE beforeEach wipe. */
const OPERATOR_LIVE_GATES = captureFinanceFr1FixtureOperatorLiveGates(
  process.env,
);

const reportDir = join(process.cwd(), ".local", "finance-fr1-pilot");
const reportPath = join(process.cwd(), FINANCE_FR1_SYNTHETIC_FIXTURE_SAFE_SUMMARY_PATH);

let report: FinanceFr1RegistryFixtureProvisionSafeSummary =
  emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
    harnessArmed: CREATE,
    overallStatus: CREATE ? "REFUSED_GATES" : "SKIPPED",
  });

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(serialized).not.toMatch(/password|token|private_key|BEGIN PRIVATE/i);
  writeFileSync(reportPath, serialized);
}

function disableWriteFlags(): void {
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.CUSTOMER_WRITE_ENABLED = "false";
  resetEnvCache();
}

describe("FR1 synthetic fixture harness (SKIP / dry-run / live create)", () => {
  afterAll(() => {
    disableWriteFlags();
    try {
      writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it("defaults SKIP; dry-run plans; armed runs real create-only path", async () => {
    expect(ORDER_TRIGGER_INSPECTION).toBe("NO-GO");
    expect(
      FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION.totalProductionWrites,
    ).toBe(0);
    expect(
      FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE.totalProductionWrites,
    ).toBe(2);
    void FINANCE_FR1_SYNTHETIC_FIXTURE_CLEANUP_COMMAND;

    const prep = prepareFinanceFr1SyntheticFixture();
    expect(prep.REGISTRY_FIXTURE_DESIGN).toBe("PASS");
    expect(prep.productionWritesThisSession).toBe(0);

    if (!CREATE && !DRY_RUN) {
      const gate = evaluateFinanceFr1SyntheticFixtureCreateGate({
        FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE:
          process.env.FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE,
        writeFlagsAllFalse: true,
        financeWriteEnabled: false,
      });
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.code).toBe("FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_SKIP");
      expect(gate.actualCreate).toBe(false);

      const provision = await runFinanceFr1RegistryFixtureProvision({
        mode: "preparation",
      });
      expect(provision.status).toBe("REFUSED_PREP");
      expect(provision.productionWrites).toBe(0);
      report = provision.summary;
      return;
    }

    if (DRY_RUN) {
      const plan = prepareFinanceFr1SyntheticFixture();
      expect(plan.ORDER_TRIGGER_INSPECTION).toBe("NO-GO");
      expect(plan.safeFixtureStrategy.orderPathCreate).toBe("FORBIDDEN");
      expect(plan.productionWritesThisSession).toBe(0);
      report = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
        harnessArmed: false,
        overallStatus: "SKIPPED",
        denials: ["dry_run"],
        blocker: "dry_run_no_mutation",
      });
      return;
    }

    // CREATE=1 — re-apply operator gates wiped by global beforeEach.
    applyFinanceFr1FixtureOperatorLiveEnvironment(OPERATOR_LIVE_GATES);
    resetEnvCache();

    const target =
      process.env.TARGET === "registry" ? "registry" : "order";
    const gate = evaluateFinanceFr1SyntheticFixtureCreateGate({
      FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: "1",
      target,
      writeFlagsAllFalse: true,
      financeWriteEnabled: process.env.FINANCE_WRITE_ENABLED === "true",
      projectId:
        process.env.EXPECTED_PROJECT_ID ??
        FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
      documentId:
        process.env.DOCUMENT_ID ?? FINANCE_FR1_SYNTHETIC_ORDER_ID,
      idempotencyKey:
        process.env.IDEMPOTENCY_KEY ??
        FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
    });

    if (!gate.ok) {
      const provision = await runFinanceFr1RegistryFixtureProvision({
        mode: "live_create",
        env: process.env,
      });
      expect(provision.productionWrites).toBe(0);
      report = provision.summary;
      return;
    }

    const port = await createFirebaseFinanceFr1RegistryFixtureFirestorePort({
      projectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
    });
    const provision = await runFinanceFr1RegistryFixtureProvision({
      mode: "live_create",
      env: process.env,
      firestorePort: port,
    });
    report = provision.summary;

    expect(provision.summary.forbiddenWritesZero).toBe(true);
    expect([
      FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS,
      "FIXTURE_ALREADY_EXISTS",
      "CONFLICT_NO_GO",
      "IAM_PREFLIGHT_FAILED",
      "VERIFICATION_FAILED",
      "REFUSED_GATES",
    ]).toContain(provision.status);

    if (provision.status === FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS) {
      expect(provision.productionWrites).toBe(2);
      expect(provision.summary.actualRegistryWrites).toBe(1);
      expect(provision.summary.actualIdempotencyWrites).toBe(1);
      expect(provision.summary.verificationPass).toBe(true);
    }
    if (provision.status === "FIXTURE_ALREADY_EXISTS") {
      expect(provision.productionWrites).toBe(0);
    }
  });

  it("preserves FINANCE_FR1 create arm through sanitization; never write flags", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });
});
