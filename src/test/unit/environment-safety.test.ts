import { describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache, SAFETY_FLAGS_DEFAULT_FALSE } from "@/config/env";
import {
  assertProductionWriteAllowed,
  ProductionWriteBlockedError,
  getSafetySnapshot,
  DOMAIN_WRITE_FLAGS,
} from "@/config/safety";

describe("environment safety", () => {
  const production = {
    NODE_ENV: "production", APP_ENV: "production", AUTH_MODE: "verified_token",
    PRODUCTION_WRITE_ENABLED: true, GLOBAL_PRODUCTION_WRITE_ENABLED: true,
  };

  it("defaults production reports to canonical data even during write pilots", () => {
    expect(loadEnv(production).FINANCE_REPORTING_SOURCE_MODE).toBe("production_read_only");
  });

  it("never permits a generic write through master switches", () => {
    const env = loadEnv({ ...production, DRIVER_WRITE_ENABLED: true });
    expect(() => assertProductionWriteAllowed("generic", env)).toThrow(/explicit supported/);
  });

  it.each(Object.entries(DOMAIN_WRITE_FLAGS))("isolates the %s gate from other domain gates", (domain, flag) => {
    const otherFlags = Object.fromEntries(Object.values(DOMAIN_WRITE_FLAGS).map(name => [name, name !== flag]));
    const env = loadEnv({ ...production, ...otherFlags });
    const typedDomain = domain as keyof typeof DOMAIN_WRITE_FLAGS;
    expect(() => assertProductionWriteAllowed(typedDomain, env)).toThrow(flag);
    const enabled = loadEnv({ ...production, [flag]: true });
    expect(() => assertProductionWriteAllowed(typedDomain, enabled)).not.toThrow();
    expect(getSafetySnapshot(enabled).effectivelyWritable).toBe(true);
    for (const master of ["GLOBAL_PRODUCTION_WRITE_ENABLED", "PRODUCTION_WRITE_ENABLED"]) {
      expect(() => assertProductionWriteAllowed(typedDomain, loadEnv({ ...production, [flag]: true, [master]: false }))).toThrow();
    }
  });
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
      // Writes must never switch reports to synthetic data.
      FINANCE_REPORTING_SOURCE_MODE: "production_read_only",
      PRODUCTION_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "false",
    });
    expect(() => assertProductionWriteAllowed("driver", env)).toThrow(
      /DRIVER_WRITE_ENABLED/,
    );
  });
});
