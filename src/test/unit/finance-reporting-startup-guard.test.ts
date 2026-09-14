import { describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "@/config/env";
import {
  assertFinanceReportingStartupOrThrow,
  FinanceReportingStartupError,
} from "@/infrastructure/production/ops/FinanceReportingStartupGuard";
import { resolveFinanceReportingSourceMode } from "@/application/finance/reporting/FinanceReportingSourceMode";

describe("Finance reporting startup guard", () => {
  it("allows synthetic outside Production", () => {
    expect(() =>
      assertFinanceReportingStartupOrThrow({
        APP_ENV: "development",
        NODE_ENV: "development",
        EXPECTED_ENVIRONMENT: "development",
        FINANCE_REPORTING_SOURCE_MODE: "synthetic",
      }),
    ).not.toThrow();
  });

  it("fails loudly when Production would resolve Finance to synthetic", () => {
    expect(() =>
      assertFinanceReportingStartupOrThrow({
        APP_ENV: "production",
        NODE_ENV: "production",
        EXPECTED_ENVIRONMENT: "production",
        FINANCE_REPORTING_SOURCE_MODE: "synthetic",
      }),
    ).toThrow(FinanceReportingStartupError);
  });

  it("allows synthetic in Production only when a write gate is armed (pilot)", () => {
    expect(() =>
      assertFinanceReportingStartupOrThrow({
        APP_ENV: "production",
        NODE_ENV: "production",
        EXPECTED_ENVIRONMENT: "production",
        FINANCE_REPORTING_SOURCE_MODE: "synthetic",
        DRIVER_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
      }),
    ).not.toThrow();
  });

  it("fails loudly when Production mode is test", () => {
    expect(() =>
      assertFinanceReportingStartupOrThrow({
        APP_ENV: "production",
        NODE_ENV: "production",
        EXPECTED_ENVIRONMENT: "production",
        FINANCE_REPORTING_SOURCE_MODE: "test",
      }),
    ).toThrow(/production_read_only/);
  });

  it("allows production_read_only in Production", () => {
    expect(() =>
      assertFinanceReportingStartupOrThrow({
        APP_ENV: "production",
        NODE_ENV: "production",
        EXPECTED_ENVIRONMENT: "production",
        FINANCE_REPORTING_SOURCE_MODE: "production_read_only",
      }),
    ).not.toThrow();
  });

  it("loadEnv fail-closes Production + synthetic via env schema", () => {
    resetEnvCache();
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        NEXT_PUBLIC_APP_ENV: "production",
        EXPECTED_ENVIRONMENT: "production",
        AUTH_MODE: "verified_token",
        FINANCE_REPORTING_SOURCE_MODE: "synthetic",
      }),
    ).toThrow(/Environment validation failed/);
  });

  it("loadEnv accepts Production + production_read_only with writes false", () => {
    resetEnvCache();
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "production",
      EXPECTED_ENVIRONMENT: "production",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      AUTH_MODE: "verified_token",
      FINANCE_REPORTING_SOURCE_MODE: "production_read_only",
      PRODUCTION_WRITE_ENABLED: "false",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
      FINANCE_WRITE_ENABLED: "false",
    });
    expect(env.FINANCE_REPORTING_SOURCE_MODE).toBe("production_read_only");
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
  });

  it("Production unset FINANCE_REPORTING_SOURCE_MODE arms production_read_only", () => {
    resetEnvCache();
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "production",
      EXPECTED_ENVIRONMENT: "production",
      AUTH_MODE: "verified_token",
    });
    expect(env.FINANCE_REPORTING_SOURCE_MODE).toBe("production_read_only");
  });

  it("wires FINANCE_REPORTING_SOURCE_MODE through loadEnv raw path", () => {
    resetEnvCache();
    const env = loadEnv({
      NODE_ENV: "test",
      APP_ENV: "development",
      NEXT_PUBLIC_APP_ENV: "development",
      AUTH_MODE: "mock",
      FINANCE_REPORTING_SOURCE_MODE: "production_read_only",
    });
    expect(env.FINANCE_REPORTING_SOURCE_MODE).toBe("production_read_only");
    expect(resolveFinanceReportingSourceMode(env)).toBe("production_read_only");
  });
});
