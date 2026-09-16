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
  | "region"
  | "vehicle_catalog"
  | "partner"
  | "fleet"
  | "guide"
  | "support"
  | "notification"
  | "identity"
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
  // Master switches are necessary, never sufficient: no generic write capability.
  if (domain === "generic" || !Object.hasOwn(DOMAIN_WRITE_FLAGS, domain)) {
    throw new ProductionWriteBlockedError("An explicit supported write domain is required.");
  }
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

  const flag = DOMAIN_WRITE_FLAGS[domain];
  if (!env[flag]) {
    throw new ProductionWriteBlockedError(`${flag} is false.`);
  }
}

export const DOMAIN_WRITE_FLAGS = {
  finance: "FINANCE_WRITE_ENABLED",
  driver: "DRIVER_WRITE_ENABLED",
  agent: "AGENT_WRITE_ENABLED",
  customer: "CUSTOMER_WRITE_ENABLED",
  geography: "GEOGRAPHY_WRITE_ENABLED",
  region: "REGION_WRITE_ENABLED",
  vehicle_catalog: "VEHICLE_CATALOG_WRITE_ENABLED",
  partner: "PARTNER_WRITE_ENABLED",
  fleet: "FLEET_WRITE_ENABLED",
  guide: "GUIDE_WRITE_ENABLED",
  support: "SUPPORT_WRITE_ENABLED",
  notification: "NOTIFICATION_WRITE_ENABLED",
  identity: "ADMIN_IDENTITY_WRITE_ENABLED",
} as const satisfies Record<Exclude<ProductionWriteDomain, "generic">, keyof AppEnvConfig>;

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
    adminIdentityWriteEnabled: env.ADMIN_IDENTITY_WRITE_ENABLED,
    effectivelyWritable: areProductionWritesEffectivelyEnabled(env),
  };
}
