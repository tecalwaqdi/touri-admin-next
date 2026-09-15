/**
 * Production-shadow UI navigation allow/hide lists.
 * PC-10+ operational admin uses the full production nav (reads armed, writes gated).
 * Lives in domain so UI can import without touching infrastructure/production.
 */

import { PRODUCTION_NAV_HREFS } from "@/domain/ui/navPolicy";

export type ShadowNavItem =
  | "dashboard"
  | "trips"
  | "drivers"
  | "agents"
  | "customers"
  | "geography"
  | "finance"
  | "settlements"
  | "reports"
  | "support"
  | "notifications"
  | "users"
  | "roles"
  | "audit"
  | "mapping_health";

/** Mutation chrome / execution surfaces — never nav destinations. */
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
  "finance",
  "settlements",
  "reports",
  "support",
  "notifications",
  "users",
  "roles",
  "audit",
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

/** Full PC-10 operational surfaces + mapping health (settings stay deferred). */
export const SHADOW_HREF_ALLOW = [
  ...PRODUCTION_NAV_HREFS,
  "/admin-next-health/mapping",
] as const;

/** Settings is NOT_APPLICABLE — hide from shadow/production nav. */
export const SHADOW_HREF_HIDE = ["/settings"] as const;
