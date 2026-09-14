/**
 * Phase 4B — server-side scope validation across roles.
 * UI route visibility is NOT authorization.
 */

import {
  assertReadAuthorized,
  applyServerSideScopeFilter,
  buildServerSideScopeFilter,
} from "@/domain/read/ReadAuthorization";
import { permissionsForRole } from "@/permissions/rbac";
import type { AccessScope, Role } from "@/types/roles";
import type { ScopeResource } from "@/permissions/rbac";

export type ScopeValidationCase = {
  role: Role;
  scope: AccessScope;
  requiredPermission:
    | "trips:read"
    | "drivers:read"
    | "agents:read"
    | "customers:read"
    | "audit:read";
  resource: ScopeResource;
  expectOk: boolean;
};

export type ScopeValidationResult = {
  scopeValidationPass: boolean;
  scopeViolations: number;
  casesChecked: number;
  failures: string[];
};

/** Minimum role matrix for Phase 4B offline scope gate. */
export function buildPhase4BScopeCases(): ScopeValidationCase[] {
  return [
    {
      role: "super_admin",
      scope: { type: "global" },
      requiredPermission: "trips:read",
      resource: { countryId: "saudi_arabia" },
      expectOk: true,
    },
    {
      role: "country_admin",
      scope: { type: "country", countryIds: ["saudi_arabia"] },
      requiredPermission: "trips:read",
      resource: { countryId: "saudi_arabia" },
      expectOk: true,
    },
    {
      role: "country_admin",
      scope: { type: "country", countryIds: ["saudi_arabia"] },
      requiredPermission: "trips:read",
      resource: { countryId: "egypt" },
      expectOk: false,
    },
    {
      role: "agent_user",
      scope: {
        type: "agent",
        agentIds: ["agent_sa"],
        countryIds: ["saudi_arabia"],
      },
      requiredPermission: "trips:read",
      resource: { agentId: "agent_sa", countryId: "saudi_arabia" },
      expectOk: true,
    },
    {
      role: "agent_user",
      scope: {
        type: "agent",
        agentIds: ["agent_sa"],
        countryIds: ["saudi_arabia"],
      },
      requiredPermission: "trips:read",
      resource: { agentId: "other_agent", countryId: "egypt" },
      expectOk: false,
    },
    {
      role: "support_agent",
      scope: { type: "global" },
      requiredPermission: "customers:read",
      resource: { countryId: "saudi_arabia" },
      expectOk: true,
    },
    {
      role: "auditor",
      scope: { type: "global" },
      requiredPermission: "audit:read",
      resource: { countryId: "saudi_arabia" },
      expectOk: true,
    },
    {
      role: "auditor",
      scope: { type: "global" },
      requiredPermission: "trips:read",
      resource: { countryId: "saudi_arabia" },
      expectOk: true,
    },
  ];
}

export function runPhase4BScopeValidation(
  cases: ScopeValidationCase[] = buildPhase4BScopeCases(),
): ScopeValidationResult {
  const failures: string[] = [];
  let scopeViolations = 0;

  for (const c of cases) {
    const perms = permissionsForRole(c.role);
    const auth = assertReadAuthorized({
      permissions: perms,
      scope: c.scope,
      required: c.requiredPermission,
      resource: c.resource,
    });
    const ok = auth.ok;
    if (ok !== c.expectOk) {
      scopeViolations += 1;
      failures.push(
        `${c.role}:${c.requiredPermission}:expected=${c.expectOk}:got=${ok}`,
      );
    }

    // Server filter must be built before query — never "filter after all".
    const filter = buildServerSideScopeFilter(c.scope);
    if (c.scope.type === "country" && !filter.countryIds?.length) {
      scopeViolations += 1;
      failures.push(`${c.role}:missing_server_country_filter`);
    }
    if (c.scope.type === "agent" && !filter.agentIds?.length) {
      scopeViolations += 1;
      failures.push(`${c.role}:missing_server_agent_filter`);
    }

    // Post-query apply must also enforce (defense in depth).
    if (c.scope.type !== "global") {
      const rows = [c.resource];
      const filtered = applyServerSideScopeFilter(rows, c.scope);
      const kept = filtered.length === 1;
      if (kept !== c.expectOk) {
        scopeViolations += 1;
        failures.push(`${c.role}:apply_filter_mismatch`);
      }
    }
  }

  return {
    scopeValidationPass: scopeViolations === 0,
    scopeViolations,
    casesChecked: cases.length,
    failures,
  };
}
