/**
 * Authoritative Production write-adapter classification matrix.
 * Gate disabled = OK. Fake/Stub/Memory/Disabled adapters for legitimate ops = NOT OK.
 */

export type AdapterClass =
  | "REAL"
  | "FAKE"
  | "STUB"
  | "MEMORY"
  | "DISABLED_ADAPTER"
  | "MISSING"
  | "NOT_APPLICABLE";

export type WriteDomainRow = {
  domain: string;
  adapterClass: AdapterClass;
  gate: string;
  gateDefault: false;
  productionRuntimeKind: string;
  collectionOrWorkflow: string;
  principal: string;
  notes: string;
};

export const PRODUCTION_WRITE_ADAPTER_MATRIX: readonly WriteDomainRow[] = [
  {
    domain: "Driver",
    adapterClass: "REAL",
    gate: "DRIVER_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_driver_write",
    collectionOrWorkflow: "reviewDriverApplicationV2 + user/{uid} allowlisted / WIF bindings",
    principal: "touri-admin-next-driver-review",
    notes: "Legal transitions only; CF owns review; suspend allowlisted patch",
  },
  {
    domain: "Agent",
    adapterClass: "REAL",
    gate: "AGENT_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_agent_write",
    collectionOrWorkflow: "user/{uid} Isagent",
    principal: "touri-admin-next-ops-writer",
    notes: "ONE COUNTRY ONE ACTIVE AGENT atomic",
  },
  {
    domain: "Customer",
    adapterClass: "REAL",
    gate: "CUSTOMER_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_customer_write",
    collectionOrWorkflow: "user/{uid} account state",
    principal: "touri-admin-next-ops-writer",
    notes: "No hard delete",
  },
  {
    domain: "Country",
    adapterClass: "REAL",
    gate: "GEOGRAPHY_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_geography_write",
    collectionOrWorkflow: "countries",
    principal: "touri-admin-next-ops-writer",
    notes: "Hierarchy; no CP5 cleanup; no hard delete",
  },
  {
    domain: "Region",
    adapterClass: "REAL",
    gate: "REGION_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_geography_write",
    collectionOrWorkflow: "cities (region)",
    principal: "touri-admin-next-ops-writer",
    notes: "Requires GEOGRAPHY + REGION flags",
  },
  {
    domain: "City",
    adapterClass: "REAL",
    gate: "GEOGRAPHY_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_geography_write",
    collectionOrWorkflow: "villages",
    principal: "touri-admin-next-ops-writer",
    notes: "Hierarchy parents required",
  },
  {
    domain: "Landmark",
    adapterClass: "REAL",
    gate: "GEOGRAPHY_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_geography_write",
    collectionOrWorkflow: "mkan",
    principal: "touri-admin-next-ops-writer",
    notes: "Archive/deactivate preferred",
  },
  {
    domain: "VehicleCatalog",
    adapterClass: "REAL",
    gate: "VEHICLE_CATALOG_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_p0_master_write",
    collectionOrWorkflow: "type_car",
    principal: "touri-admin-next-ops-writer",
    notes: "Catalog only",
  },
  {
    domain: "Partner",
    adapterClass: "REAL",
    gate: "PARTNER_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_p0_master_write",
    collectionOrWorkflow: "mkan where isShrek",
    principal: "touri-admin-next-ops-writer",
    notes: "Distinct from Fleet/Guide",
  },
  {
    domain: "Fleet",
    adapterClass: "REAL",
    gate: "FLEET_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_p0_master_write",
    collectionOrWorkflow: "transport_company",
    principal: "touri-admin-next-ops-writer",
    notes: "Distinct domain",
  },
  {
    domain: "Guide",
    adapterClass: "REAL",
    gate: "GUIDE_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_p0_master_write",
    collectionOrWorkflow: "user.is_tour_guide soft status",
    principal: "touri-admin-next-ops-writer",
    notes: "Soft status only",
  },
  {
    domain: "Support",
    adapterClass: "REAL",
    gate: "SUPPORT_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_support_write",
    collectionOrWorkflow: "support",
    principal: "touri-admin-next-ops-writer",
    notes: "Ticket-only",
  },
  {
    domain: "Notification",
    adapterClass: "REAL",
    gate: "NOTIFICATION_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_notification_write",
    collectionOrWorkflow: "admin_panel_notifications",
    principal: "touri-admin-next-ops-writer",
    notes: "Panel vs push; no client FCM tokens",
  },
  {
    domain: "Identity",
    adapterClass: "REAL",
    gate: "ADMIN_IDENTITY_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_identity_write",
    collectionOrWorkflow: "user allowlisted persona + CF claims",
    principal: "touri-admin-next-identity-admin",
    notes: "Dedicated WIF; never shadow-reader",
  },
  {
    domain: "Finance",
    adapterClass: "REAL",
    gate: "FINANCE_WRITE_ENABLED",
    gateDefault: false,
    productionRuntimeKind: "production_finance_write",
    collectionOrWorkflow: "Settlement V2 FR1–FR7",
    principal: "touri-admin-next-finance-writer",
    notes: "Immutable posted ledger; SoD",
  },
] as const;

export function listNonRealProductionAdapters(
  rows: readonly WriteDomainRow[] = PRODUCTION_WRITE_ADAPTER_MATRIX,
): WriteDomainRow[] {
  return rows.filter((r) => r.adapterClass !== "REAL" && r.adapterClass !== "NOT_APPLICABLE");
}
