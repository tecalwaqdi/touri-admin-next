// @vitest-environment node
/**
 * FR1 registry fixture — read-only ADC verification (SKIP default).
 *
 * Arm:
 *   FINANCE_FR1_REGISTRY_FIXTURE_VERIFY=1 \
 *   FINANCE_FR1_REGISTRY_PILOT=1 \
 *   FINANCE_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   npx vitest run src/test/live/finance-fr1-registry-fixture-verify.test.ts
 *
 * Never writes. Never creates order/. Never arms Finance write.
 */

import { afterAll, describe, expect, it } from "vitest";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { verifyFinanceFr1RegistryFixtureReadOnly } from "@/application/finance/pilot/FinanceFr1RegistryFixtureReadOnlyVerification";

const VERIFY = process.env.FINANCE_FR1_REGISTRY_FIXTURE_VERIFY === "1";

function disableWriteFlags(): void {
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.FINANCE_FR1_PILOT_APPLY = "";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.CUSTOMER_WRITE_ENABLED = "false";
}

describe("FR1 registry fixture RO verify (SKIP default)", () => {
  afterAll(() => {
    disableWriteFlags();
  });

  it("defaults SKIP; when armed verifies registry read-only", async () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    disableWriteFlags();

    if (!VERIFY) {
      expect(VERIFY).toBe(false);
      return;
    }

    const result = await verifyFinanceFr1RegistryFixtureReadOnly({
      registryPilotFlag: process.env.FINANCE_FR1_REGISTRY_PILOT,
    });
    expect(result.productionWrites).toBe(0);
    expect(result.orderPathExists).toBe(false);
  });
});
