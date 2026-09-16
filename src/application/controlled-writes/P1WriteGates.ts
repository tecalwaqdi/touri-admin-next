/**
 * P1 write gate inventory — all default FALSE, pilot-ready, hard-locked.
 */

export type P1WriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  SUPPORT_WRITE_ENABLED: boolean;
  NOTIFICATION_WRITE_ENABLED: boolean;
  FINANCE_WRITE_ENABLED: boolean;
  ADMIN_IDENTITY_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  REGION_WRITE_ENABLED: boolean;
  VEHICLE_CATALOG_WRITE_ENABLED: boolean;
  PARTNER_WRITE_ENABLED: boolean;
  FLEET_WRITE_ENABLED: boolean;
  GUIDE_WRITE_ENABLED: boolean;
  GEOGRAPHY_WRITE_ENABLED: boolean;
};

export const DEFAULT_P1_WRITE_FLAGS_FALSE: P1WriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  SUPPORT_WRITE_ENABLED: false,
  NOTIFICATION_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  ADMIN_IDENTITY_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  REGION_WRITE_ENABLED: false,
  VEHICLE_CATALOG_WRITE_ENABLED: false,
  PARTNER_WRITE_ENABLED: false,
  FLEET_WRITE_ENABLED: false,
  GUIDE_WRITE_ENABLED: false,
  GEOGRAPHY_WRITE_ENABLED: false,
};

export type P1WriteInventoryRow = {
  domain: string;
  resourceFlag: string;
  class: "A_GATED_OFF";
  productionArmed: false;
  offlineFakeExecutable: boolean;
  codeComplete: true;
  pilotReady: true;
};

export const P1_WRITE_INVENTORY: readonly P1WriteInventoryRow[] = [
  {
    domain: "support",
    resourceFlag: "SUPPORT_WRITE_ENABLED",
    class: "A_GATED_OFF",
    productionArmed: false,
    offlineFakeExecutable: true,
    codeComplete: true,
    pilotReady: true,
  },
  {
    domain: "notifications",
    resourceFlag: "NOTIFICATION_WRITE_ENABLED",
    class: "A_GATED_OFF",
    productionArmed: false,
    offlineFakeExecutable: true,
    codeComplete: true,
    pilotReady: true,
  },
  {
    domain: "financial_periods",
    resourceFlag: "FINANCE_WRITE_ENABLED",
    class: "A_GATED_OFF",
    productionArmed: false,
    offlineFakeExecutable: true,
    codeComplete: true,
    pilotReady: true,
  },
  {
    domain: "identity_admin",
    resourceFlag: "ADMIN_IDENTITY_WRITE_ENABLED",
    class: "A_GATED_OFF",
    productionArmed: false,
    offlineFakeExecutable: true,
    codeComplete: true,
    pilotReady: true,
  },
  {
    domain: "driver_create",
    resourceFlag: "DRIVER_WRITE_ENABLED",
    class: "A_GATED_OFF",
    productionArmed: false,
    offlineFakeExecutable: true,
    codeComplete: true,
    pilotReady: true,
  },
  {
    domain: "storage_landmark_images",
    resourceFlag: "GEOGRAPHY_WRITE_ENABLED|PARTNER_WRITE_ENABLED",
    class: "A_GATED_OFF",
    productionArmed: false,
    offlineFakeExecutable: true,
    codeComplete: true,
    pilotReady: true,
  },
] as const;

export function allP1WriteFlagsDisabled(flags: P1WriteFlagGate): boolean {
  return Object.values(flags).every((v) => v === false);
}
