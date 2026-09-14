/**
 * Fail-closed Finance reporting source guard.
 *
 * Cutover / Production UI (all write flags false):
 *   FINANCE_REPORTING_SOURCE_MODE must be production_read_only.
 *   synthetic / test → FAIL STARTUP loudly.
 *
 * Controlled write-armed Production sessions (any write flag true):
 *   production_read_only remains incompatible with writes (enforced in env.ts).
 *   Synthetic is permitted only while write gates are explicitly armed for pilots.
 */

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

function anyWriteFlagArmed(env: FinanceReportingStartupInput): boolean {
  return (
    env.PRODUCTION_WRITE_ENABLED === true ||
    env.GLOBAL_PRODUCTION_WRITE_ENABLED === true ||
    env.FINANCE_WRITE_ENABLED === true ||
    env.DRIVER_WRITE_ENABLED === true ||
    env.AGENT_WRITE_ENABLED === true ||
    env.CUSTOMER_WRITE_ENABLED === true
  );
}

/**
 * Production cutover/UI (writes all false) must not resolve Finance to synthetic.
 */
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

  // Write-armed controlled pilots cannot use production_read_only (writes forbidden
  // there). Synthetic/test is only tolerated while at least one write gate is armed.
  if (anyWriteFlagArmed(env)) {
    return;
  }

  throw new FinanceReportingStartupError(
    `FINANCE_REPORTING_SOURCE_MODE=${env.FINANCE_REPORTING_SOURCE_MODE} is forbidden in Production while all write flags are false — must be production_read_only (synthetic Finance is fail-closed)`,
  );
}
