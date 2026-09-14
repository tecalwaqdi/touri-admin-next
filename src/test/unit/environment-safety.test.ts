import { describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache, SAFETY_FLAGS_DEFAULT_FALSE } from "@/config/env";
import {
  assertProductionWriteAllowed,
  ProductionWriteBlockedError,
  getSafetySnapshot,
} from "@/config/safety";

describe("environment safety", () => {
  it("defaults all production safety flags to false", () => {
    resetEnvCache();
    const env = loadEnv({
      NODE_ENV: "development",
      APP_ENV: "development",
      NEXT_PUBLIC_APP_ENV: "development",
    });
    for (const flag of SAFETY_FLAGS_DEFAULT_FALSE) {
      expect(env[flag]).toBe(false);
    }
  });

  it("fails startup when production write is enabled in development", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "development",
        APP_ENV: "development",
        NEXT_PUBLIC_APP_ENV: "development",
        PRODUCTION_WRITE_ENABLED: "true",
      }),
    ).toThrow(/Environment validation failed/);
  });

  it("keeps production writes disabled by default even when APP_ENV=production", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "production",
      AUTH_MODE: "verified_token",
    });
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(() => assertProductionWriteAllowed("generic", env)).toThrow(
      ProductionWriteBlockedError,
    );
    expect(getSafetySnapshot(env).effectivelyWritable).toBe(false);
  });

  it("requires global kill switch plus domain flag", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "production",
      AUTH_MODE: "verified_token",
      // Write-armed pilot path — not production_read_only (RO forbids writes)
      FINANCE_REPORTING_SOURCE_MODE: "synthetic",
      PRODUCTION_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "false",
    });
    expect(() => assertProductionWriteAllowed("driver", env)).toThrow(
      /DRIVER_WRITE_ENABLED/,
    );
  });
});
