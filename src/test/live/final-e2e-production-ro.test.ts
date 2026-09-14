// @vitest-environment node
/**
 * Final E2E live Production RO arm.
 * DEFAULT: SKIP unless FINANCE_FR7_PRODUCTION_RO_VALIDATE=1 (ADC, no SA JSON).
 *
 *   FINANCE_FR7_PRODUCTION_RO_VALIDATE=1 \
 *   FINANCE_REPORTING_SOURCE_MODE=production_read_only \
 *   FINANCE_WRITE_ENABLED=false \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=false \
 *   PRODUCTION_WRITE_ENABLED=false \
 *   DRIVER_WRITE_ENABLED=false \
 *   AGENT_WRITE_ENABLED=false \
 *   CUSTOMER_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *     npx vitest run src/test/live/final-e2e-production-ro.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  FINANCE_FR7_PRODUCTION_RO_VALIDATE_ENV,
  isFinanceFr7ProductionRoValidateEnabled,
  validateFinanceFr7ProductionReadOnly,
} from "@/application/finance/reporting/FinanceFr7ProductionRoValidation";
import { createFirebaseFinanceReportingRoFirestorePort } from "@/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort";
import { FINANCE_FR7_EXPECTED_PROJECT_ID } from "@/application/finance/pilot/FinanceFr7PilotConstants";
import {
  runFinalE2eReconciliation,
  writeCutoverReadinessJson,
} from "@/application/final-e2e/FinalE2eReconciliation";

const LIVE = isFinanceFr7ProductionRoValidateEnabled(
  process.env[FINANCE_FR7_PRODUCTION_RO_VALIDATE_ENV],
);

describe("Final E2E live Production RO", () => {
  it.runIf(!LIVE)(
    "SKIP live Final E2E RO — set FINANCE_FR7_PRODUCTION_RO_VALIDATE=1 with ADC",
    () => {
      expect(LIVE).toBe(false);
    },
  );

  it.runIf(LIVE)("live Final E2E RO + readiness CUTOVER gate", async () => {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      throw new Error("SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS");
    }
    expect(process.env.FINANCE_WRITE_ENABLED).not.toBe("true");
    expect(process.env.GLOBAL_PRODUCTION_WRITE_ENABLED).not.toBe("true");
    expect(process.env.PRODUCTION_WRITE_ENABLED).not.toBe("true");

    const firestore = await createFirebaseFinanceReportingRoFirestorePort({
      projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
    });
    const ro = await validateFinanceFr7ProductionReadOnly({
      firestore,
      expectGoldenMatch: true,
    });

    expect(ro.totalProductionWrites).toBe(0);
    expect(ro.firestoreMutations).toBe(0);
    expect(ro.overallStatus).toBe("PASS");

    const report = await runFinalE2eReconciliation({
      productionRoResult: ro,
      liveProductionRo: ro.overallStatus === "PASS" ? "PASS" : "NO-GO",
      financeReportingSourceMode: "production_read_only",
    });

    expect(report.totalProductionWrites).toBe(0);
    expect(report.firestoreMutations).toBe(0);
    expect(report.blockers).toEqual([]);
    expect(report.overallStatus).toBe("CUTOVER_GO");
    writeCutoverReadinessJson(report);
  });
});
