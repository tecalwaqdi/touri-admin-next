/**
 * PC-9 — Authoritative controlled-write inventory (code mirror of
 * docs/ADMIN_NEXT_CONTROLLED_WRITE_MATRIX.md). Production arms stay false.
 */

export type ControlledWriteReadiness =
  | "READY_EXISTING"
  | "PARTIAL"
  | "MISSING"
  | "NOT_APPROVED"
  | "DANGEROUS_DEFER";

export type ControlledWriteInventoryRow = {
  workstream: "W1" | "W2" | "W3" | "W4" | "W5" | "W6";
  domain: "drivers" | "agents" | "geography" | "finance" | "customers" | "users_roles";
  readiness: ControlledWriteReadiness;
  apiPaths: readonly string[];
  permission: string;
  resourceFlag: string;
  productionArmed: false;
  offlineFakeExecutable: boolean;
  notes: string;
};

export const PC9_CONTROLLED_WRITE_INVENTORY: readonly ControlledWriteInventoryRow[] =
  [
    {
      workstream: "W1",
      domain: "drivers",
      readiness: "READY_EXISTING",
      apiPaths: [
        "/api/drivers/[id]/approve",
        "/api/drivers/[id]/reject",
        "/api/drivers/[id]/needs_changes",
        "/api/drivers/[id]/suspend",
      ],
      permission: "drivers:approve",
      resourceFlag: "DRIVER_WRITE_ENABLED",
      productionArmed: false,
      offlineFakeExecutable: true,
      notes:
        "Legal transition matrix + bridged Fake; Production DisabledDriverWriteRepository",
    },
    {
      workstream: "W2",
      domain: "agents",
      readiness: "READY_EXISTING",
      apiPaths: [
        "/api/agents/[id]/activate",
        "/api/agents/[id]/deactivate",
        "/api/agents/[id]/suspend",
      ],
      permission: "agents:manage",
      resourceFlag: "AGENT_WRITE_ENABLED",
      productionArmed: false,
      offlineFakeExecutable: true,
      notes: "ONE COUNTRY ONE ACTIVE AGENT fail-closed atomic",
    },
    {
      workstream: "W3",
      domain: "geography",
      readiness: "DANGEROUS_DEFER",
      apiPaths: [],
      permission: "geography:read",
      resourceFlag: "GEOGRAPHY_WRITE_ENABLED",
      productionArmed: false,
      offlineFakeExecutable: false,
      notes: "No mutation routes; no PC-6 auto-cleanup",
    },
    {
      workstream: "W4",
      domain: "finance",
      readiness: "PARTIAL",
      apiPaths: [
        "/api/settlements",
        "/api/settlements/[id]/submit",
        "/api/settlements/[id]/approve",
        "/api/settlements/[id]/reject",
        "/api/settlements/[id]/close",
        "/api/settlements/[id]/reverse",
      ],
      permission: "settlements:create|approve|execute|reverse",
      resourceFlag: "FINANCE_WRITE_ENABLED",
      productionArmed: false,
      offlineFakeExecutable: true,
      notes: "Existing SoD only; no finance calc / SM changes",
    },
    {
      workstream: "W5",
      domain: "customers",
      readiness: "READY_EXISTING",
      apiPaths: [
        "/api/customers/[id]/disable",
        "/api/customers/[id]/block",
        "/api/customers/[id]/reactivate",
      ],
      permission: "customers:manage",
      resourceFlag: "CUSTOMER_WRITE_ENABLED",
      productionArmed: false,
      offlineFakeExecutable: true,
      notes:
        "disable/block/reactivate only; compliant deletion DANGEROUS_DEFER; Auth write false",
    },
    {
      workstream: "W6",
      domain: "users_roles",
      readiness: "NOT_APPROVED",
      apiPaths: [],
      permission: "users:read|roles:read",
      resourceFlag: "N/A",
      productionArmed: false,
      offlineFakeExecutable: false,
      notes: "Read-only unless security-approved claims path",
    },
  ] as const;

export type WriteExposureCell = {
  surface: string;
  productionUiExposed: false | "chrome_flag_only";
  productionWriteExecutable: false;
  offlineFakeExecutable: boolean;
  genericWrite: 0;
  arbitraryPatch: 0;
  clientFirestore: 0;
  saJson: 0;
  adcWrite: 0;
  syntheticProductionFallback: 0;
};

export const PC9_WRITE_EXPOSURE_REPORT: readonly WriteExposureCell[] = [
  {
    surface: "drivers",
    productionUiExposed: "chrome_flag_only",
    productionWriteExecutable: false,
    offlineFakeExecutable: true,
    genericWrite: 0,
    arbitraryPatch: 0,
    clientFirestore: 0,
    saJson: 0,
    adcWrite: 0,
    syntheticProductionFallback: 0,
  },
  {
    surface: "agents",
    productionUiExposed: "chrome_flag_only",
    productionWriteExecutable: false,
    offlineFakeExecutable: true,
    genericWrite: 0,
    arbitraryPatch: 0,
    clientFirestore: 0,
    saJson: 0,
    adcWrite: 0,
    syntheticProductionFallback: 0,
  },
  {
    surface: "customers",
    productionUiExposed: "chrome_flag_only",
    productionWriteExecutable: false,
    offlineFakeExecutable: true,
    genericWrite: 0,
    arbitraryPatch: 0,
    clientFirestore: 0,
    saJson: 0,
    adcWrite: 0,
    syntheticProductionFallback: 0,
  },
  {
    surface: "geography",
    productionUiExposed: false,
    productionWriteExecutable: false,
    offlineFakeExecutable: false,
    genericWrite: 0,
    arbitraryPatch: 0,
    clientFirestore: 0,
    saJson: 0,
    adcWrite: 0,
    syntheticProductionFallback: 0,
  },
  {
    surface: "finance_sod",
    productionUiExposed: "chrome_flag_only",
    productionWriteExecutable: false,
    offlineFakeExecutable: true,
    genericWrite: 0,
    arbitraryPatch: 0,
    clientFirestore: 0,
    saJson: 0,
    adcWrite: 0,
    syntheticProductionFallback: 0,
  },
  {
    surface: "users_roles",
    productionUiExposed: false,
    productionWriteExecutable: false,
    offlineFakeExecutable: false,
    genericWrite: 0,
    arbitraryPatch: 0,
    clientFirestore: 0,
    saJson: 0,
    adcWrite: 0,
    syntheticProductionFallback: 0,
  },
] as const;

export function assertPc9ProductionWriteArmsDisabled(env: {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  AGENT_WRITE_ENABLED: boolean;
  CUSTOMER_WRITE_ENABLED: boolean;
  CUSTOMER_AUTH_WRITE_ENABLED?: boolean;
  FINANCE_WRITE_ENABLED: boolean;
  GEOGRAPHY_WRITE_ENABLED?: boolean;
}): void {
  const flags = [
    env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    env.PRODUCTION_WRITE_ENABLED,
    env.DRIVER_WRITE_ENABLED,
    env.AGENT_WRITE_ENABLED,
    env.CUSTOMER_WRITE_ENABLED,
    env.CUSTOMER_AUTH_WRITE_ENABLED ?? false,
    env.FINANCE_WRITE_ENABLED,
    env.GEOGRAPHY_WRITE_ENABLED ?? false,
  ];
  if (flags.some(Boolean)) {
    throw new Error("PC-9 requires all Production write arms to remain false");
  }
}
