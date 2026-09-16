/**
 * P0 narrow write gates — all default FALSE.
 * Prefer archive/deactivate over delete. Production hard-disabled.
 */

export type P0WriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  REGION_WRITE_ENABLED: boolean;
  VEHICLE_CATALOG_WRITE_ENABLED: boolean;
  PARTNER_WRITE_ENABLED: boolean;
  FLEET_WRITE_ENABLED: boolean;
  GUIDE_WRITE_ENABLED: boolean;
  /** Existing geography umbrella (countries/cities/landmarks). */
  GEOGRAPHY_WRITE_ENABLED: boolean;
  FINANCE_WRITE_ENABLED: boolean;
};

export const DEFAULT_P0_WRITE_FLAGS_FALSE: P0WriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  REGION_WRITE_ENABLED: false,
  VEHICLE_CATALOG_WRITE_ENABLED: false,
  PARTNER_WRITE_ENABLED: false,
  FLEET_WRITE_ENABLED: false,
  GUIDE_WRITE_ENABLED: false,
  GEOGRAPHY_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
};

/** Hard lock — Production path never executes even if env flipped. */
export const P0_PRODUCTION_WRITE_HARD_FALSE = false as const;

export type P0WriteDomain =
  | "region"
  | "vehicle_catalog"
  | "partner"
  | "fleet"
  | "guide";

function domainFlag(domain: P0WriteDomain, flags: P0WriteFlagGate): boolean {
  switch (domain) {
    case "region":
      return flags.REGION_WRITE_ENABLED;
    case "vehicle_catalog":
      return flags.VEHICLE_CATALOG_WRITE_ENABLED;
    case "partner":
      return flags.PARTNER_WRITE_ENABLED;
    case "fleet":
      return flags.FLEET_WRITE_ENABLED;
    case "guide":
      return flags.GUIDE_WRITE_ENABLED;
  }
}

export function assertP0ProductionWriteEnabled(
  domain: P0WriteDomain,
  flags: P0WriteFlagGate,
): void {
  if (
    !flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    !flags.PRODUCTION_WRITE_ENABLED ||
    !domainFlag(domain, flags)
  ) {
    throw Object.assign(new Error(`${domain.toUpperCase()}_WRITE_DISABLED`), {
      code: "PRODUCTION_WRITE_DISABLED" as const,
    });
  }
  if (P0_PRODUCTION_WRITE_HARD_FALSE === (false as boolean)) {
    throw Object.assign(
      new Error(`${domain} write Production path hard-disabled`),
      { code: "PRODUCTION_WRITE_DISABLED" as const },
    );
  }
}

export function allP0WriteFlagsDisabled(flags: P0WriteFlagGate): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === false &&
    flags.PRODUCTION_WRITE_ENABLED === false &&
    flags.REGION_WRITE_ENABLED === false &&
    flags.VEHICLE_CATALOG_WRITE_ENABLED === false &&
    flags.PARTNER_WRITE_ENABLED === false &&
    flags.FLEET_WRITE_ENABLED === false &&
    flags.GUIDE_WRITE_ENABLED === false &&
    flags.GEOGRAPHY_WRITE_ENABLED === false &&
    flags.FINANCE_WRITE_ENABLED === false
  );
}

/** Classification for P0 write readiness inventory. */
export type P0WriteReadinessClass = "A_GATED_OFF" | "B_MISSING";

export type P0WriteInventoryRow = {
  domain: P0WriteDomain | "settlement_payments" | "geography_region";
  class: P0WriteReadinessClass;
  resourceFlag: string;
  productionArmed: false;
  offlineFakeExecutable: boolean;
  notes: string;
};

export const P0_WRITE_INVENTORY: readonly P0WriteInventoryRow[] = [
  {
    domain: "geography_region",
    class: "A_GATED_OFF",
    resourceFlag: "REGION_WRITE_ENABLED",
    productionArmed: false,
    offlineFakeExecutable: true,
    notes: "Region CRUD on cities collection; prefer deactivate/archive",
  },
  {
    domain: "vehicle_catalog",
    class: "A_GATED_OFF",
    resourceFlag: "VEHICLE_CATALOG_WRITE_ENABLED",
    productionArmed: false,
    offlineFakeExecutable: true,
    notes: "type_car master; deactivate preferred over delete",
  },
  {
    domain: "settlement_payments",
    class: "A_GATED_OFF",
    resourceFlag: "FINANCE_WRITE_ENABLED",
    productionArmed: false,
    offlineFakeExecutable: true,
    notes: "FR5 create/confirm/reverse via SettlementCommandService; SoD",
  },
  {
    domain: "partner",
    class: "A_GATED_OFF",
    resourceFlag: "PARTNER_WRITE_ENABLED",
    productionArmed: false,
    offlineFakeExecutable: true,
    notes: "Partner landmarks (isShrek); archive/deactivate preferred",
  },
  {
    domain: "fleet",
    class: "A_GATED_OFF",
    resourceFlag: "FLEET_WRITE_ENABLED",
    productionArmed: false,
    offlineFakeExecutable: true,
    notes: "transport_company distinct domain",
  },
  {
    domain: "guide",
    class: "A_GATED_OFF",
    resourceFlag: "GUIDE_WRITE_ENABLED",
    productionArmed: false,
    offlineFakeExecutable: true,
    notes: "Tour guide soft status transitions only",
  },
] as const;
