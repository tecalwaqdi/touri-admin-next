/** Production finance always uses canonical records, regardless of write gates. */

export class FinanceReportingStartupError extends Error {
  readonly code = "FINANCE_REPORTING_STARTUP_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "FinanceReportingStartupError";
  }
}

export type FinanceReportingStartupInput = {
  APP_ENV: "development" | "staging" | "production";
  NODE_ENV: "development" | "test" | "production";
  EXPECTED_ENVIRONMENT: "development" | "staging" | "production";
  FINANCE_REPORTING_SOURCE_MODE: "synthetic" | "production_read_only" | "test";
  PRODUCTION_WRITE_ENABLED?: boolean;
  GLOBAL_PRODUCTION_WRITE_ENABLED?: boolean;
  FINANCE_WRITE_ENABLED?: boolean;
  DRIVER_WRITE_ENABLED?: boolean;
  AGENT_WRITE_ENABLED?: boolean;
  CUSTOMER_WRITE_ENABLED?: boolean;
};

export function assertFinanceReportingStartupOrThrow(
  env: FinanceReportingStartupInput,
): void {
  const productionIntent =
    env.APP_ENV === "production" ||
    (env.EXPECTED_ENVIRONMENT === "production" && env.NODE_ENV === "production");

  if (!productionIntent) {
    return;
  }

  if (env.FINANCE_REPORTING_SOURCE_MODE === "production_read_only") {
    return;
  }

  throw new FinanceReportingStartupError(
    `FINANCE_REPORTING_SOURCE_MODE=${env.FINANCE_REPORTING_SOURCE_MODE} is forbidden in Production — must be production_read_only (synthetic Finance is fail-closed)`,
  );
}
