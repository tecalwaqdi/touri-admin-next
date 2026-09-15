import {
  areProductionWritesEffectivelyEnabled,
  getEnv,
  type AppEnvConfig,
} from "@/config/env";

export type ProductionWriteDomain =
  | "finance"
  | "driver"
  | "agent"
  | "customer"
  | "geography"
  | "generic";

export class ProductionWriteBlockedError extends Error {
  readonly code = "PRODUCTION_WRITE_BLOCKED";

  constructor(message: string) {
    super(message);
    this.name = "ProductionWriteBlockedError";
  }
}

export function assertProductionWriteAllowed(
  domain: ProductionWriteDomain = "generic",
  env: AppEnvConfig = getEnv(),
): void {
  if (!env.PRODUCTION_WRITE_ENABLED) {
    throw new ProductionWriteBlockedError(
      "PRODUCTION_WRITE_ENABLED is false. Production writes are blocked.",
    );
  }
  if (!env.GLOBAL_PRODUCTION_WRITE_ENABLED) {
    throw new ProductionWriteBlockedError(
      "GLOBAL_PRODUCTION_WRITE_ENABLED kill switch is off.",
    );
  }

  if (domain === "finance" && !env.FINANCE_WRITE_ENABLED) {
    throw new ProductionWriteBlockedError("FINANCE_WRITE_ENABLED is false.");
  }
  if (domain === "driver" && !env.DRIVER_WRITE_ENABLED) {
    throw new ProductionWriteBlockedError("DRIVER_WRITE_ENABLED is false.");
  }
  if (domain === "agent" && !env.AGENT_WRITE_ENABLED) {
    throw new ProductionWriteBlockedError("AGENT_WRITE_ENABLED is false.");
  }
  if (domain === "customer" && !env.CUSTOMER_WRITE_ENABLED) {
    throw new ProductionWriteBlockedError("CUSTOMER_WRITE_ENABLED is false.");
  }
  if (domain === "geography" && !env.GEOGRAPHY_WRITE_ENABLED) {
    throw new ProductionWriteBlockedError("GEOGRAPHY_WRITE_ENABLED is false.");
  }
}

export function getSafetySnapshot(env: AppEnvConfig = getEnv()) {
  return {
    appEnv: env.APP_ENV,
    productionReadEnabled: env.PRODUCTION_READ_ENABLED,
    productionWriteEnabled: env.PRODUCTION_WRITE_ENABLED,
    globalProductionWriteEnabled: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    financeWriteEnabled: env.FINANCE_WRITE_ENABLED,
    driverWriteEnabled: env.DRIVER_WRITE_ENABLED,
    agentWriteEnabled: env.AGENT_WRITE_ENABLED,
    customerWriteEnabled: env.CUSTOMER_WRITE_ENABLED,
    customerAuthWriteEnabled: env.CUSTOMER_AUTH_WRITE_ENABLED,
    geographyWriteEnabled: env.GEOGRAPHY_WRITE_ENABLED,
    effectivelyWritable: areProductionWritesEffectivelyEnabled(env),
  };
}
