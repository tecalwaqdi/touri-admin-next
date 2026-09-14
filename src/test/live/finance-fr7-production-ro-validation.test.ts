// @vitest-environment node
/**
 * FR7 Production RO validation live harness.
 * DEFAULT: SKIP unless FINANCE_FR7_PRODUCTION_RO_VALIDATE=1.
 * ADC only; no SA JSON keys; Production writes = 0.
 *
 *   FINANCE_FR7_PRODUCTION_RO_VALIDATE=1 \
 *   FINANCE_WRITE_ENABLED=false \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=false \
 *   PRODUCTION_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *     npx vitest run src/test/live/finance-fr7-production-ro-validation.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  FINANCE_FR7_PRODUCTION_RO_VALIDATE_ENV,
  isFinanceFr7ProductionRoValidateEnabled,
  validateFinanceFr7ProductionReadOnly,
} from "@/application/finance/reporting/FinanceFr7ProductionRoValidation";
import { createFirebaseFinanceReportingRoFirestorePort } from "@/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort";
import { FINANCE_FR7_EXPECTED_PROJECT_ID } from "@/application/finance/pilot/FinanceFr7PilotConstants";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

const LIVE = isFinanceFr7ProductionRoValidateEnabled(
  process.env[FINANCE_FR7_PRODUCTION_RO_VALIDATE_ENV],
);

describe("FR7 Production RO validation harness", () => {
  it("defaults to SKIP when env unset", () => {
    expect(
      isFinanceFr7ProductionRoValidateEnabled(undefined),
    ).toBe(false);
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
  });

  it.runIf(!LIVE)(
    "SKIP live body — set FINANCE_FR7_PRODUCTION_RO_VALIDATE=1 with ADC to run",
    () => {
      expect(LIVE).toBe(false);
    },
  );

  it.runIf(LIVE)("live RO validate — writes remain 0", async () => {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      throw new Error("SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS");
    }
    expect(process.env.FINANCE_WRITE_ENABLED).not.toBe("true");
    expect(process.env.GLOBAL_PRODUCTION_WRITE_ENABLED).not.toBe("true");
    expect(process.env.PRODUCTION_WRITE_ENABLED).not.toBe("true");

    const firestore = await createFirebaseFinanceReportingRoFirestorePort({
      projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
    });
    const result = await validateFinanceFr7ProductionReadOnly({
      firestore,
      expectGoldenMatch: true,
    });

    expect(result.totalProductionWrites).toBe(0);
    expect(result.firestoreMutations).toBe(0);
    expect(result.firestoreMutations).toBe(firestore.getCounter().firestoreMutations);
    expect(result.overallStatus).toBe("PASS");
    expect(result.goldenMatch).toBe(true);
    expect(result.settlementListParity).toBe(true);
    expect(result.settlementDetailParity).toBe(true);
    expect(result.canonicalCountryMatch).toBe(true);
    expect(result.scopePass).toBe(true);
  });
});
