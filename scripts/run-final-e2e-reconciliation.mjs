#!/usr/bin/env node
/**
 * Final E2E + Final Reconciliation runner.
 * Writes .local/final-e2e/cutover-readiness.json
 * Does NOT perform Cutover.
 *
 *   node scripts/run-final-e2e-reconciliation.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, ".local/final-e2e/cutover-readiness.json");
const DOC = join(ROOT, "docs/FINAL_E2E_RECONCILIATION_REPORT.md");

function run(cmd, args, env = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function parseVitestSummary(stdout) {
  // Success: "Test Files  129 passed (129)"
  // Mixed:   "Test Files  1 failed | 129 passed (130)"
  const filesPassed = stdout.match(/Test Files.*?(\d+)\s+passed/i);
  const filesFailed = stdout.match(/Test Files.*?(\d+)\s+failed/i);
  const testsPassed = stdout.match(/Tests.*?(\d+)\s+passed/i);
  const testsFailed = stdout.match(/Tests.*?(\d+)\s+failed/i);
  const testsSkipped = stdout.match(/Tests.*?(\d+)\s+skipped/i);
  return {
    files: filesPassed
      ? Number(filesPassed[1]) + (filesFailed ? Number(filesFailed[1]) : 0)
      : filesFailed
        ? Number(filesFailed[1])
        : null,
    passed: testsPassed ? Number(testsPassed[1]) : null,
    failed: testsFailed ? Number(testsFailed[1]) : 0,
    skipped: testsSkipped ? Number(testsSkipped[1]) : 0,
  };
}

function main() {
  mkdirSync(dirname(OUT), { recursive: true });

  const baseEnv = {
    FINANCE_REPORTING_SOURCE_MODE: "production_read_only",
    FINANCE_WRITE_ENABLED: "false",
    GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
    PRODUCTION_WRITE_ENABLED: "false",
    DRIVER_WRITE_ENABLED: "false",
    AGENT_WRITE_ENABLED: "false",
    CUSTOMER_WRITE_ENABLED: "false",
    CUSTOMER_AUTH_WRITE_ENABLED: "false",
  };

  console.log("== Final E2E targeted ==");
  const targeted = run(
    "npx",
    [
      "vitest",
      "run",
      "src/test/unit/final-e2e-reconciliation.test.ts",
      "src/test/unit/final-admin-architecture.test.ts",
      "src/test/integration/final-admin-ui.test.tsx",
      "src/test/unit/finance-fr7-production-ro.test.ts",
      "src/test/unit/canonical-country-id.test.ts",
      "src/test/unit/permissions.test.ts",
      "src/test/unit/scope.test.ts",
      "src/test/unit/agent-assignment.test.ts",
      "src/test/unit/environment-safety.test.ts",
      "src/test/unit/api-auth-production.test.ts",
      "src/test/unit/finance-f5-commands-gate-rbac.test.ts",
    ],
    baseEnv,
  );
  process.stdout.write(targeted.stdout || "");
  process.stderr.write(targeted.stderr || "");

  let liveStatus = "SKIP";
  const adcProbe = run("gcloud", [
    "auth",
    "application-default",
    "print-access-token",
  ]);
  const adcOk =
    adcProbe.status === 0 && !process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (adcOk) {
    console.log("== Production RO live validation (ADC) ==");
    const live = run(
      "npx",
      ["vitest", "run", "src/test/live/final-e2e-production-ro.test.ts"],
      {
        ...baseEnv,
        FINANCE_FR7_PRODUCTION_RO_VALIDATE: "1",
        EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
        GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
      },
    );
    process.stdout.write(live.stdout || "");
    process.stderr.write(live.stderr || "");
    liveStatus = live.status === 0 ? "PASS" : "NO-GO";
  } else {
    console.log("== Production RO live SKIP (no ADC or SA JSON set) ==");
  }

  console.log("== Full npm test ==");
  // Do not leak production_read_only into the full suite — unit tests assert
  // default synthetic. Final E2E targeted/live already exercised RO mode above.
  const fullEnv = { ...baseEnv };
  delete fullEnv.FINANCE_REPORTING_SOURCE_MODE;
  const full = run("npm", ["test"], {
    ...fullEnv,
    FINANCE_REPORTING_SOURCE_MODE: "synthetic",
  });
  process.stdout.write(full.stdout || "");
  process.stderr.write(full.stderr || "");
  const testCounts = parseVitestSummary(full.stdout || "");

  console.log("== typecheck ==");
  const tc = run("npm", ["run", "typecheck"], {
    ...fullEnv,
    FINANCE_REPORTING_SOURCE_MODE: "synthetic",
  });
  process.stdout.write(tc.stdout || "");
  process.stderr.write(tc.stderr || "");
  const typecheck = tc.status === 0 ? "PASS" : "FAIL";

  console.log("== build ==");
  const bd = run("npm", ["run", "build"], {
    ...fullEnv,
    FINANCE_REPORTING_SOURCE_MODE: "synthetic",
  });
  process.stdout.write(bd.stdout || "");
  process.stderr.write(bd.stderr || "");
  const build = bd.status === 0 ? "PASS" : "FAIL";

  let report = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : null;

  const blockers = new Set(report?.blockers ?? []);
  if (targeted.status !== 0) blockers.add("final_e2e_targeted_failed");
  if (full.status !== 0) blockers.add("npm_test_failed");
  if (typecheck !== "PASS") blockers.add("typecheck_failed");
  if (build !== "PASS") blockers.add("build_failed");
  if (liveStatus === "NO-GO") blockers.add("live_production_ro_failed");

  const criticalOk =
    !!report &&
    report.financeGoldenMatch === true &&
    report.settlementParity === true &&
    report.reconciliationPass === true &&
    report.canonicalCountryPass === true &&
    report.oneCountryOneAgentPass === true &&
    report.rbacPass === true &&
    report.scopePass === true &&
    report.piiMaskingPass === true &&
    report.productionReadPass === true &&
    report.syntheticFallbackAbsent === true &&
    report.uiRegressionPass === true &&
    report.securityScanPass === true &&
    report.totalProductionWrites === 0 &&
    report.firestoreMutations === 0 &&
    blockers.size === 0 &&
    liveStatus !== "NO-GO";

  report = {
    ...(report ?? {}),
    overallStatus: criticalOk ? "CUTOVER_GO" : "CUTOVER_NO_GO",
    tests: testCounts,
    typecheck,
    build,
    liveProductionRo: liveStatus,
    blockers: [...blockers],
    financeReportingSourceMode:
      report?.financeReportingSourceMode ?? "production_read_only",
    generatedAtUtc: new Date().toISOString(),
    totalProductionWrites: report?.totalProductionWrites ?? 0,
    firestoreMutations: report?.firestoreMutations ?? 0,
  };

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(
    DOC,
    `# Final E2E + Final Reconciliation

Generated: ${report.generatedAtUtc}

## overallStatus
\`${report.overallStatus}\`

## Gates
| Field | Value |
|---|---|
| financeGoldenMatch | ${report.financeGoldenMatch} |
| settlementParity | ${report.settlementParity} |
| reconciliationPass | ${report.reconciliationPass} |
| canonicalCountryPass | ${report.canonicalCountryPass} |
| oneCountryOneAgentPass | ${report.oneCountryOneAgentPass} |
| rbacPass | ${report.rbacPass} |
| scopePass | ${report.scopePass} |
| piiMaskingPass | ${report.piiMaskingPass} |
| productionReadPass | ${report.productionReadPass} |
| syntheticFallbackAbsent | ${report.syntheticFallbackAbsent} |
| uiRegressionPass | ${report.uiRegressionPass} |
| securityScanPass | ${report.securityScanPass} |
| totalProductionWrites | ${report.totalProductionWrites} |
| firestoreMutations | ${report.firestoreMutations} |
| liveProductionRo | ${report.liveProductionRo} |
| tests | files=${testCounts.files} passed=${testCounts.passed} failed=${testCounts.failed} skipped=${testCounts.skipped} |
| typecheck | ${typecheck} |
| build | ${build} |

## blockers
${report.blockers.length ? report.blockers.map((b) => `- ${b}`).join("\n") : "(none)"}

## Machine-readable
\`.local/final-e2e/cutover-readiness.json\`

STOP — Cutover not performed.
`,
    "utf8",
  );

  console.log("\n== READINESS ==");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overallStatus === "CUTOVER_GO" ? 0 : 1);
}

main();
