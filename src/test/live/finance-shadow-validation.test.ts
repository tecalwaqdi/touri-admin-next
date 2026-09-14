// @vitest-environment node
/**
 * Finance shadow live harness — READ-ONLY ADC against Production.
 *
 * DEFAULT: SKIP unless PHASE_FINANCE_SHADOW=1.
 *
 * Operator (local only):
 *   PHASE_FINANCE_SHADOW=1 \
 *     npx vitest run src/test/live/finance-shadow-validation.test.ts
 *
 * Absolute: FINANCE_WRITE_ENABLED=false; Production Finance writes=0;
 * no settlement/payout execution; no CF deploy.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhaseFinanceShadowEnabled } from "@/domain/finance/shadow/isPhaseFinanceShadowEnabled";
import {
  runFinanceShadowLiveAdc,
  runFinanceShadowOnDocuments,
} from "@/application/finance/shadow/FinanceShadowOrchestrator";
import type { FinanceShadowAggregate } from "@/domain/finance/shadow/FinanceShadowTypes";
import { assertFinanceShadowReportSafe } from "@/domain/finance/shadow/financeShadowPii";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

const LIVE = isPhaseFinanceShadowEnabled(process.env.PHASE_FINANCE_SHADOW);

const reportDir = join(process.cwd(), ".local", "finance-shadow");
const reportPath = join(reportDir, "live-safe-summary.json");

let report: FinanceShadowAggregate = {
  ...runFinanceShadowOnDocuments({
    mode: "offline_fixture",
    orders: [],
    settlements: [],
  }),
  overallStatus: LIVE ? "NO_GO" : "SKIPPED",
  blockers: LIVE
    ? ["pending_live_execution"]
    : ["SKIPPED — set PHASE_FINANCE_SHADOW=1 for read-only live shadow"],
};

function disableWriteFlags(): void {
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.CUSTOMER_WRITE_ENABLED = "false";
}

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const serialized = JSON.stringify(report, null, 2);
  expect(assertFinanceShadowReportSafe(serialized).piiViolations).toBe(0);
  expect(serialized).not.toMatch(/password|private_key|BEGIN PRIVATE/i);
  writeFileSync(reportPath, `${serialized}\n`, "utf8");
}

describe("Finance live shadow harness (SKIP default)", () => {
  afterAll(() => {
    disableWriteFlags();
    try {
      writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it(
    "defaults SKIP; when armed runs ADC read-only finance shadow",
    async () => {
      expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
      disableWriteFlags();

      if (!LIVE) {
        const r = await runFinanceShadowLiveAdc({ harnessArmed: false });
        expect(r.summary.overallStatus).toBe("SKIPPED");
        expect(r.summary.productionWrites).toBe(0);
        expect(r.productionWriteInvoked).toBe(false);
        report = r.summary;
        return;
      }

      const r = await runFinanceShadowLiveAdc({ harnessArmed: true });
      expect(r.productionWriteInvoked).toBe(false);
      expect(r.summary.productionWrites).toBe(0);
      expect(r.summary.financeWriteEnabled).toBe(false);
      expect(r.summary.piiViolations).toBe(0);
      expect(r.summary.recordsScanned).toBeGreaterThan(0);
      expect(r.summary.mismatchesByCategory.MAPPING_ERROR).toBe(0);
      expect(r.summary.mismatchesByCategory.CALCULATION_ERROR).toBe(0);
      expect(r.summary.controlledFinanceRolloutPrep).toBe("GO");
      expect(r.summary.blockers.some((b) => b.includes("FC-01"))).toBe(false);
      report = r.summary;
      expect(["SHADOW_PASS", "NO_GO"]).toContain(r.summary.overallStatus);
    },
    90_000,
  );
});
