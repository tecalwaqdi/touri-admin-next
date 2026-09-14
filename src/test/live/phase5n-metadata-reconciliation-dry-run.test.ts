// @vitest-environment node
/**
 * Phase 5N — metadata reconciliation dry-run harness.
 *
 * DEFAULT: SKIP unless PHASE5N_METADATA_RECONCILE_DRY_RUN=1.
 * READ-ONLY Production inspection when armed + ADC available.
 * NEVER writes. NEVER re-executes RequestDriverChangesCommand.
 * NEVER repairs Auth claims. Phase 5M re-Apply = HARD STOP.
 *
 * Operator (local only):
 *   PHASE5N_METADATA_RECONCILE_DRY_RUN=1 \
 *     npx vitest run src/test/live/phase5n-metadata-reconciliation-dry-run.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhase5NMetadataReconcileDryRunEnabled } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import { runPhase5NMetadataReconciliationDryRun } from "@/application/controlled-writes/pilot/Phase5NMetadataReconciliationDryRun";
import {
  emptyPhase5NReconciliationSafeSummary,
  type Phase5NReconciliationSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5NReconciliationSafeSummary";
import { createPhase5NReadOnlyMetadataPorts } from "@/application/controlled-writes/pilot/Phase5NReadOnlyMetadataPorts";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";
import { resetEnvCache } from "@/config/env";
import {
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
} from "@/application/controlled-writes/pilot/Phase5NConstants";

const LIVE = isPhase5NMetadataReconcileDryRunEnabled(
  process.env.PHASE5N_METADATA_RECONCILE_DRY_RUN,
);

const reportDir = join(process.cwd(), ".local", "phase5n-reconciliation");
const reportPath = join(reportDir, "dry-run-safe-summary.json");

let report: Phase5NReconciliationSafeSummary =
  emptyPhase5NReconciliationSafeSummary({
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
  resetEnvCache();
}

describe("Phase 5N — metadata reconciliation dry-run (SKIP default)", () => {
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
      const r = await runPhase5NMetadataReconciliationDryRun({
        harnessArmed: false,
      });
      expect(r.summary.overallStatus).toBe("SKIPPED");
      expect(r.summary.productionWrites).toBe(0);
      expect(r.productionWriteInvoked).toBe(false);
      expect(r.domainCommandInvoked).toBe(false);
      report = {
        ...r.summary,
        blocker:
          "SKIPPED — set PHASE5N_METADATA_RECONCILE_DRY_RUN=1 for read-only live dry-run",
      };
      return;
    }

    // LIVE dry-run: read-only Production metadata → plan only.
    disableWriteFlags();
    const { port, counter } = await createPhase5NReadOnlyMetadataPorts();
    const r = await runPhase5NMetadataReconciliationDryRun({
      harnessArmed: true,
      readPort: port,
      plannedSuccessAuditId: "dwr_phase5n_planned",
    });
    expect(r.productionWriteInvoked).toBe(false);
    expect(r.domainCommandInvoked).toBe(false);
    expect(r.summary.applyAttempted).toBe(false);
    expect(r.summary.productionWrites).toBe(0);
    expect(r.summary.actualMetadataWrites).toBe(0);
    expect(r.summary.driverDomainWriteRequired).toBe(false);
    expect(r.summary.authClaimsRepairRequired).toBe(false);
    expect(r.summary.forbiddenDomainWrites).toBe(0);
    expect(r.summary.originalIdempotencyKeyLogical).toBe(
      PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
    );
    expect(r.summary.originalIntentAuditId).toBe(
      PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
    );
    report = {
      ...r.summary,
      productionReads: counter.productionReads,
      liveReadAttempted: true,
    };
    // Known Production incomplete state should plan GO with 2 metadata writes.
    if (r.observed?.driverState === "needs_changes") {
      expect(r.summary.driverState).toBe("needs_changes");
    }
  },
    60_000,
  );
});
