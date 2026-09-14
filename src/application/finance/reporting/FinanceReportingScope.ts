/**
 * FR7 — Scope + RBAC helpers for Finance reporting read models.
 * Cross-country fail closed. Uses existing AccessScope + permissions.
 * Country IDs compared as canonical only (SA → saudi_arabia at boundary).
 */

import type { AccessScope, Role } from "@/types/roles";
import { canAccess, isWithinScope } from "@/permissions/rbac";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinanceReportingMeta } from "@/domain/finance/reporting/FinanceReportingTypes";
import {
  requireCanonicalCountryId,
  tryCanonicalCountryId,
} from "@/domain/geography/CanonicalCountryId";

export type FinanceReportingActor = {
  userId: string;
  role: Role;
  permissions: Array<FinancePermission | string>;
  scope: AccessScope;
};

export function assertFinanceReadPermission(actor: FinanceReportingActor): void {
  if (!actor.permissions.includes("finance:read")) {
    throw new Error("rbac_denied:finance:read");
  }
}

export function assertReportsExportPermission(
  actor: FinanceReportingActor,
): void {
  assertFinanceReadPermission(actor);
  if (!actor.permissions.includes("reports:export")) {
    throw new Error("rbac_denied:reports:export");
  }
}

export function resolveReportingScopeLabel(
  scope: AccessScope,
): FinanceReportingMeta["scope"] {
  if (scope.type === "global") return "global";
  if (scope.type === "country") return "country";
  if (scope.type === "agent") return "agent";
  return "country";
}

export function assertCountryInScope(
  actor: FinanceReportingActor,
  countryId: string,
): void {
  assertFinanceReadPermission(actor);
  const canonical = requireCanonicalCountryId(countryId);
  if (actor.scope.type === "global") return;
  const scopedIds = (actor.scope.countryIds ?? [])
    .map((id) => tryCanonicalCountryId(id))
    .filter((id): id is string => id != null);
  if (actor.scope.type === "country" || actor.scope.type === "agent") {
    if (scopedIds.length > 0 && !scopedIds.includes(canonical)) {
      throw new Error(`cross_country_denied:${canonical}`);
    }
    if (scopedIds.length === 0 && actor.scope.type === "country") {
      throw new Error(`cross_country_denied:${canonical}`);
    }
    return;
  }
  if (!isWithinScope(actor.scope, { countryId: canonical })) {
    throw new Error(`cross_country_denied:${canonical}`);
  }
}

export function assertAgentInScope(
  actor: FinanceReportingActor,
  resource: { countryId: string; agentId: string },
): void {
  assertFinanceReadPermission(actor);
  const canonicalCountry = requireCanonicalCountryId(resource.countryId);
  if (actor.scope.type === "global") return;
  if (actor.scope.type === "country") {
    assertCountryInScope(actor, canonicalCountry);
    return;
  }
  if (
    !isWithinScope(actor.scope, {
      countryId: canonicalCountry,
      agentId: resource.agentId,
    })
  ) {
    throw new Error(`scope_denied:agent:${resource.agentId}`);
  }
}

export function canReadFinanceResource(
  actor: FinanceReportingActor,
  resource: { countryId?: string | null; agentId?: string | null },
): boolean {
  const countryId = resource.countryId
    ? tryCanonicalCountryId(resource.countryId)
    : null;
  return canAccess(
    actor.permissions as never,
    actor.scope,
    "finance:read",
    { ...resource, countryId },
  );
}

/** Default scope expectations by role (product policy). */
export function defaultScopeForRole(role: Role): AccessScope {
  switch (role) {
    case "super_admin":
      return { type: "global" };
    case "operations_manager":
      return { type: "global" };
    case "accountant":
    case "finance_approver":
    case "auditor":
    case "reporting_viewer":
      return { type: "global" };
    case "country_admin":
      return { type: "country", countryIds: [] };
    case "agent_user":
      return { type: "agent", agentIds: [], countryIds: [] };
    default:
      return { type: "country", countryIds: [] };
  }
}
