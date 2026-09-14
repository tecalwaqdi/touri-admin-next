/**
 * Phase 4 DESIGN — Admin Next mutation route inventory (code mirror of docs).
 * Synthetic mutations must never target Production repos.
 */

export type MutationRouteClass =
  | "synthetic-only"
  | "read-only"
  | "mutation";

export type MutationRouteInventoryRow = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  classification: MutationRouteClass;
  domain: string;
  shadowBehavior:
    | "allowed_read"
    | "hide_ui"
    | "disabled_write_repo"
    | "reject_production_write";
  notes: string;
};

export const ADMIN_NEXT_MUTATION_ROUTE_INVENTORY: MutationRouteInventoryRow[] = [
  {
    method: "GET",
    path: "/api/trips",
    classification: "read-only",
    domain: "trips",
    shadowBehavior: "allowed_read",
    notes: "List trips",
  },
  {
    method: "GET",
    path: "/api/trips/[id]",
    classification: "read-only",
    domain: "trips",
    shadowBehavior: "allowed_read",
    notes: "Trip detail",
  },
  {
    method: "GET",
    path: "/api/drivers",
    classification: "read-only",
    domain: "drivers",
    shadowBehavior: "allowed_read",
    notes: "List drivers",
  },
  {
    method: "GET",
    path: "/api/drivers/[id]",
    classification: "read-only",
    domain: "drivers",
    shadowBehavior: "allowed_read",
    notes: "Driver detail",
  },
  {
    method: "GET",
    path: "/api/agents",
    classification: "read-only",
    domain: "agents",
    shadowBehavior: "allowed_read",
    notes: "List agents",
  },
  {
    method: "GET",
    path: "/api/agents/[id]",
    classification: "read-only",
    domain: "agents",
    shadowBehavior: "allowed_read",
    notes: "Agent detail",
  },
  {
    method: "POST",
    path: "/api/agents/activate",
    classification: "mutation",
    domain: "agents",
    shadowBehavior: "reject_production_write",
    notes: "Synthetic only today; Production → PRODUCTION_WRITE_DISABLED",
  },
  {
    method: "GET",
    path: "/api/dashboard",
    classification: "read-only",
    domain: "dashboard",
    shadowBehavior: "allowed_read",
    notes: "Safe KPIs only in shadow",
  },
  {
    method: "GET",
    path: "/api/audit",
    classification: "read-only",
    domain: "audit",
    shadowBehavior: "allowed_read",
    notes: "Audit list",
  },
  {
    method: "GET",
    path: "/api/audit/[id]",
    classification: "read-only",
    domain: "audit",
    shadowBehavior: "allowed_read",
    notes: "Audit detail",
  },
  {
    method: "GET",
    path: "/api/reports",
    classification: "read-only",
    domain: "reports",
    shadowBehavior: "allowed_read",
    notes: "Reports summary",
  },
  {
    method: "GET",
    path: "/api/reports/export",
    classification: "mutation",
    domain: "reports",
    shadowBehavior: "hide_ui",
    notes: "Export DISABLED in first 4A",
  },
  {
    method: "GET",
    path: "/api/settlements",
    classification: "read-only",
    domain: "settlements",
    shadowBehavior: "hide_ui",
    notes: "Settlement V2 OUT OF INITIAL SCOPE",
  },
  {
    method: "GET",
    path: "/api/settlements/[id]",
    classification: "read-only",
    domain: "settlements",
    shadowBehavior: "hide_ui",
    notes: "Settlement detail — hide in shadow nav",
  },
  {
    method: "GET",
    path: "/api/settlements/eligibility",
    classification: "read-only",
    domain: "settlements",
    shadowBehavior: "hide_ui",
    notes: "Eligibility — synthetic only",
  },
  {
    method: "POST",
    path: "/api/settlements",
    classification: "mutation",
    domain: "settlements",
    shadowBehavior: "reject_production_write",
    notes: "Create settlement — synthetic-only; never Production",
  },
  {
    method: "POST",
    path: "/api/settlements/[id]/submit",
    classification: "mutation",
    domain: "settlements",
    shadowBehavior: "reject_production_write",
    notes: "Settlement submit",
  },
  {
    method: "POST",
    path: "/api/settlements/[id]/approve",
    classification: "mutation",
    domain: "settlements",
    shadowBehavior: "reject_production_write",
    notes: "Settlement approve",
  },
  {
    method: "POST",
    path: "/api/settlements/[id]/reject",
    classification: "mutation",
    domain: "settlements",
    shadowBehavior: "reject_production_write",
    notes: "Settlement reject",
  },
  {
    method: "POST",
    path: "/api/settlements/[id]/close",
    classification: "mutation",
    domain: "settlements",
    shadowBehavior: "reject_production_write",
    notes: "Settlement close",
  },
  {
    method: "POST",
    path: "/api/settlements/[id]/reverse",
    classification: "mutation",
    domain: "settlements",
    shadowBehavior: "reject_production_write",
    notes: "Settlement reverse",
  },
];

export function listMutationRoutes(): MutationRouteInventoryRow[] {
  return ADMIN_NEXT_MUTATION_ROUTE_INVENTORY.filter(
    (r) => r.classification === "mutation",
  );
}

/**
 * Future trap: every mutation route must resolve to PRODUCTION_WRITE_DISABLED
 * when shadow container write ports are used.
 */
export async function assertMutationRoutesHitDisabledWrite(
  execute: (route: MutationRouteInventoryRow) => Promise<{ code: string }>,
): Promise<void> {
  for (const route of listMutationRoutes()) {
    const result = await execute(route);
    if (result.code !== "PRODUCTION_WRITE_DISABLED") {
      throw new Error(
        `Mutation route ${route.method} ${route.path} did not return PRODUCTION_WRITE_DISABLED`,
      );
    }
  }
}
