import { describe, expect, it } from "vitest";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { OPERATIONAL_LIVE_READ_RESOURCES } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
const input = { PRODUCTION_READ_ENABLED: true, PRODUCTION_READ_MODE: "shadow" as const, AUTH_MODE: "verified_token" as const, EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j", PRODUCTION_WRITE_ENABLED: false, GLOBAL_PRODUCTION_WRITE_ENABLED: false, FINANCE_WRITE_ENABLED: false, DRIVER_WRITE_ENABLED: false, AGENT_WRITE_ENABLED: false, CUSTOMER_WRITE_ENABLED: false, FULL_PII_SHADOW_ENABLED: false, LIVE_SHADOW_ALLOWED_RESOURCES: OPERATIONAL_LIVE_READ_RESOURCES.join(","), PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger" as const };
describe("complete operational read window", () => {
  it("includes regions and catalogs without enabling writes", () => {
    expect(OPERATIONAL_LIVE_READ_RESOURCES).toContain("regions");
    expect(() => assertLiveShadowStartupOrThrow(input)).not.toThrow();
    expect(() => assertLiveShadowStartupOrThrow({ ...input, DRIVER_WRITE_ENABLED: true })).toThrow();
  });
  it("still rejects arbitrary collections", () => {
    expect(() => assertLiveShadowStartupOrThrow({ ...input, LIVE_SHADOW_ALLOWED_RESOURCES: input.LIVE_SHADOW_ALLOWED_RESOURCES + ",secrets" })).toThrow();
  });
});
