// @vitest-environment node
/**
 * Phase 5H pivot — existing approved synthetic Driver qualification dry-run.
 *
 * DEFAULT: SKIP unless PHASE5H_EXISTING_APPROVED_DRIVER_DRY_RUN=1.
 * Plan / Auth / diff only. actualWrite=false. Do NOT suspend. Do NOT rollback.
 * Do NOT create fixture/Auth. Do NOT enable write flags. Do NOT start Finance.
 * Do NOT auto-run live Production dry-run in CI / agents.
 *
 * Operator (local only, still NO-GO on Auth):
 *   PHASE5H_EXISTING_APPROVED_DRIVER_DRY_RUN=1 \
 *     npx vitest run src/test/live/phase5h-existing-approved-driver-qualification.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { isPhase5HExistingApprovedDriverDryRunEnabled } from "@/application/controlled-writes/pilot/isPhase5HExistingApprovedDriverDryRunEnabled";
import {
  assertPhase5HExistingApprovedWriteFlagsFalse,
  PHASE_5H_EXISTING_APPROVED_WRITE_FLAGS_FALSE,
  runPhase5HExistingApprovedDriverDryRun,
} from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverDryRun";
import { qualifyExistingApprovedSyntheticDriver } from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverQualification";

const LIVE = isPhase5HExistingApprovedDriverDryRunEnabled(
  process.env.PHASE5H_EXISTING_APPROVED_DRIVER_DRY_RUN,
);
const reportDir = join(process.cwd(), ".local", "phase5h-existing-approved");
const reportPath = join(reportDir, "qualification-safe-summary.json");

type SafeReport = {
  overallStatus: "SKIPPED" | "OFFLINE_NO_GO" | "FAIL";
  liveAttempted: boolean;
  actualWrite: false;
  wouldWrite: false;
  productionWrites: 0;
  authWrites: 0;
  financeWrites: 0;
  tripWrites: 0;
  EXISTING_APPROVED_SYNTHETIC_PILOT: "NO_GO";
  recommendation: "AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING";
  safeTargetId: string;
  blocker?: string;
  noGoCodes?: readonly string[];
  qualificationScore?: number;
};

const report: SafeReport = {
  overallStatus: "SKIPPED",
  liveAttempted: false,
  actualWrite: false,
  wouldWrite: false,
  productionWrites: 0,
  authWrites: 0,
  financeWrites: 0,
  tripWrites: 0,
  EXISTING_APPROVED_SYNTHETIC_PILOT: "NO_GO",
  recommendation: "AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING",
  safeTargetId: "PENDING_OPERATOR",
  blocker:
    "PHASE5H_EXISTING_APPROVED_DRIVER_DRY_RUN!=1 — live body not executed",
};

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

describe("Phase 5H — existing approved synthetic Driver harness (SKIP / dry-run)", () => {
  afterAll(() => {
    expect(assertPhase5HExistingApprovedWriteFlagsFalse()).toBe(true);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    try {
      if (LIVE || existsSync(reportDir)) writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it("defaults to SKIP; write flags false; no Production mutation", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(
      PHASE_5H_EXISTING_APPROVED_WRITE_FLAGS_FALSE.FINANCE_WRITE_ENABLED,
    ).toBe(false);
    expect(
      ProductionDriverWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
      }),
    ).toBe(false);

    if (!LIVE) {
      const q = qualifyExistingApprovedSyntheticDriver();
      expect(q.EXISTING_APPROVED_SYNTHETIC_PILOT).toBe("NO_GO");
      expect(q.auth.AUTH_SIDE_EFFECT_PRESENT).toBe(true);
      report.overallStatus = "SKIPPED";
      report.blocker =
        "PHASE5H_EXISTING_APPROVED_DRIVER_DRY_RUN!=1 — live body not executed";
      report.noGoCodes = q.noGoCodes;
      report.qualificationScore = q.qualificationScore;
      expect(report.productionWrites).toBe(0);
      return;
    }

    // Operator-controlled offline dry-run path (still NO-GO; no Production write).
    report.liveAttempted = true;
    const result = runPhase5HExistingApprovedDriverDryRun({ envFlag: "1" });
    expect(result.actualWrite).toBe(false);
    expect(result.wouldWrite).toBe(false);
    expect(result.productionApplyInvocationCount).toBe(0);
    expect(result.qualification.EXISTING_APPROVED_SYNTHETIC_PILOT).toBe(
      "NO_GO",
    );
    expect(result.qualification.auth.AUTH_SIDE_EFFECT_PRESENT).toBe(true);
    expect(result.qualification.recommendation).toBe(
      "AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING",
    );
    expect(result.qualification.silentFallbackToOtherDriver).toBe(false);

    report.overallStatus = "OFFLINE_NO_GO";
    report.safeTargetId = String(result.qualification.safeTargetId);
    report.noGoCodes = result.qualification.noGoCodes;
    report.qualificationScore = result.qualification.qualificationScore;
    report.blocker = result.qualification.auth.stopReason;
    report.productionWrites = 0;
    report.authWrites = 0;
    report.financeWrites = 0;
    report.tripWrites = 0;
  });
});
