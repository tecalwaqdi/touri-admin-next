/**
 * Final E2E + Final Reconciliation suite (offline + Production RO fake port).
 * Live Production RO is covered separately under src/test/live/.
 */

import { describe, expect, it } from "vitest";
import {
  assertWriteFlagsAllFalse,
  runCanonicalCountryChecks,
  runFinalE2eReconciliation,
  runOneCountryOneAgentChecks,
  runRbacE2eChecks,
  runSecurityScanChecks,
  runUiRegressionStaticChecks,
  writeCutoverReadinessJson,
  FINAL_E2E_READINESS_PATH,
} from "@/application/final-e2e/FinalE2eReconciliation";
import { existsSync, readFileSync } from "node:fs";

describe("Final E2E reconciliation", () => {
  it("write flags remain false for Final E2E", () => {
    const flags = assertWriteFlagsAllFalse({
      FINANCE_WRITE_ENABLED: "false",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
      PRODUCTION_WRITE_ENABLED: "false",
      DRIVER_WRITE_ENABLED: "false",
      AGENT_WRITE_ENABLED: "false",
      CUSTOMER_WRITE_ENABLED: "false",
      CUSTOMER_AUTH_WRITE_ENABLED: "false",
    });
    expect(flags.ok).toBe(true);
  });

  it("RBAC matrix E2E gates", () => {
    expect(runRbacE2eChecks().pass).toBe(true);
  });

  it("canonical country aliases collapse to saudi_arabia", () => {
    expect(runCanonicalCountryChecks().pass).toBe(true);
  });

  it("one-country-one-agent invariant", () => {
    expect(runOneCountryOneAgentChecks().pass).toBe(true);
  });

  it("UI regression + security static scans pass", () => {
    expect(runUiRegressionStaticChecks().pass).toBe(true);
    expect(runSecurityScanChecks().pass).toBe(true);
  });

  it("full offline Final E2E → CUTOVER_GO with writes=0", async () => {
    process.env.FINANCE_REPORTING_SOURCE_MODE = "production_read_only";
    process.env.FINANCE_WRITE_ENABLED = "false";
    process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
    process.env.PRODUCTION_WRITE_ENABLED = "false";
    process.env.DRIVER_WRITE_ENABLED = "false";
    process.env.AGENT_WRITE_ENABLED = "false";
    process.env.CUSTOMER_WRITE_ENABLED = "false";

    const report = await runFinalE2eReconciliation({
      liveProductionRo: "SKIP",
      financeReportingSourceMode: "production_read_only",
      typecheck: "PENDING",
      build: "PENDING",
    });

    expect(report.financeGoldenMatch).toBe(true);
    expect(report.settlementParity).toBe(true);
    expect(report.reconciliationPass).toBe(true);
    expect(report.canonicalCountryPass).toBe(true);
    expect(report.oneCountryOneAgentPass).toBe(true);
    expect(report.rbacPass).toBe(true);
    expect(report.scopePass).toBe(true);
    expect(report.piiMaskingPass).toBe(true);
    expect(report.productionReadPass).toBe(true);
    expect(report.syntheticFallbackAbsent).toBe(true);
    expect(report.uiRegressionPass).toBe(true);
    expect(report.securityScanPass).toBe(true);
    expect(report.totalProductionWrites).toBe(0);
    expect(report.firestoreMutations).toBe(0);
    expect(report.blockers).toEqual([]);
    expect(report.overallStatus).toBe("CUTOVER_GO");

    const path = writeCutoverReadinessJson(report);
    expect(path.endsWith(FINAL_E2E_READINESS_PATH)).toBe(true);
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    expect(parsed.overallStatus).toBe("CUTOVER_GO");
    expect(parsed.totalProductionWrites).toBe(0);
  });
});
