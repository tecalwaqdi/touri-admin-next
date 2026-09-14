/**
 * Phase 4A-0 — Shadow UI navigation allow/hide lists.
 * Lives in domain so UI can import without touching infrastructure/production.
 */

export type ShadowNavItem =
  | "dashboard"
  | "trips"
  | "drivers"
  | "agents"
  | "customers"
  | "geography"
  | "mapping_health";

export type HiddenShadowNavItem =
  | "settlements_execution"
  | "finance_approval"
  | "users_mutations"
  | "settings_mutations"
  | "driver_approval"
  | "agent_assignment"
  | "refunds"
  | "export";

export const SHADOW_NAV_ALLOWED: ShadowNavItem[] = [
  "dashboard",
  "trips",
  "drivers",
  "agents",
  "customers",
  "geography",
  "mapping_health",
];

export const SHADOW_NAV_HIDDEN: HiddenShadowNavItem[] = [
  "settlements_execution",
  "finance_approval",
  "users_mutations",
  "settings_mutations",
  "driver_approval",
  "agent_assignment",
  "refunds",
  "export",
];

export const SHADOW_HREF_ALLOW = [
  "/dashboard",
  "/trips",
  "/drivers",
  "/agents",
  "/customers",
  "/geography",
  "/admin-next-health/mapping",
] as const;

export const SHADOW_HREF_HIDE = [
  "/settlements",
  "/finance",
  "/reports",
  "/settings",
  "/users",
  "/support",
] as const;
