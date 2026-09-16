/**
 * Phase 4 DESIGN — scope expansion guard.
 * Request cannot expand beyond authorized scope.
 * Backend builds filter; client countryId/agentId/global=true cannot escalate.
 */

import type { AccessScope } from "@/types/roles";
import { buildServerSideScopeFilter } from "@/domain/read/ReadAuthorization";
import type { ScopedFilter } from "@/domain/read/ReadAuthorization";

export type ClientScopeHint = {
  countryId?: string | null;
  countryIds?: string[] | null;
  agentId?: string | null;
  agentIds?: string[] | null;
  cityId?: string | null;
  cityIds?: string[] | null;
  /** Client claiming global — always ignored / denied for non-global actors */
  global?: boolean | null;
};

export type ScopeEnforcementResult =
  | { ok: true; serverFilter: ScopedFilter; forced: boolean }
  | { ok: false; reason: string; code: "SCOPE_DENIED" | "SCOPE_EXPANSION_DENIED" };

function intersectIds(
  authorized: string[] | undefined,
  requested: string[] | undefined,
): string[] | undefined {
  if (!authorized || authorized.length === 0) {
    return requested;
  }
  if (!requested || requested.length === 0) {
    return [...authorized];
  }
  const authSet = new Set(authorized);
  return requested.filter((id) => authSet.has(id));
}

/**
 * Enforce: build server filter from actor scope, then intersect with client hints.
 * Escalation attempts → DENY (prefer deny over silent broaden).
 */
export function enforceReadScope(input: {
  actorScope: AccessScope;
  clientHint?: ClientScopeHint | null;
  /** When true, out-of-scope client hints DENY instead of force-clip. */
  denyOnExpansion?: boolean;
}): ScopeEnforcementResult {
  const denyOnExpansion = input.denyOnExpansion ?? true;
  const serverFilter = buildServerSideScopeFilter(input.actorScope);
  const hint = input.clientHint ?? {};

  // Validate the authority before intersecting request hints. An empty scope
  // must never acquire its authority from a caller-supplied country/city/agent.
  const scope = input.actorScope;
  if (
    (scope.type === "country" && !scope.countryIds?.length) ||
    (scope.type === "city" && !scope.cityIds?.length) ||
    (scope.type === "agent" && (!scope.agentIds?.length || !scope.countryIds?.length)) ||
    !["global", "country", "city", "agent"].includes(scope.type)
  ) {
    return { ok: false, reason: "missing authorized scope", code: "SCOPE_DENIED" };
  }

  if (hint.global === true && input.actorScope.type !== "global") {
    return {
      ok: false,
      reason: "Client global=true cannot escalate scope",
      code: "SCOPE_EXPANSION_DENIED",
    };
  }

  const requestedCountries = [
    ...(hint.countryIds ?? []),
    ...(hint.countryId ? [hint.countryId] : []),
  ].filter(Boolean) as string[];

  const requestedAgents = [
    ...(hint.agentIds ?? []),
    ...(hint.agentId ? [hint.agentId] : []),
  ].filter(Boolean) as string[];

  const requestedCities = [
    ...(hint.cityIds ?? []),
    ...(hint.cityId ? [hint.cityId] : []),
  ].filter(Boolean) as string[];

  if (input.actorScope.type === "global") {
    return {
      ok: true,
      serverFilter: {
        countryIds: requestedCountries.length
          ? requestedCountries
          : undefined,
        agentIds: requestedAgents.length ? requestedAgents : undefined,
        cityIds: requestedCities.length ? requestedCities : undefined,
      },
      forced: false,
    };
  }

  // Country-scoped actor requesting another country
  if (serverFilter.countryIds && requestedCountries.length) {
    const outOfScope = requestedCountries.filter(
      (id) => !serverFilter.countryIds!.includes(id),
    );
    if (outOfScope.length) {
      if (denyOnExpansion) {
        return {
          ok: false,
          reason: `country admin cannot expand to ${outOfScope.join(",")}`,
          code: "SCOPE_EXPANSION_DENIED",
        };
      }
    }
  }

  if (serverFilter.agentIds && requestedAgents.length) {
    const outOfScope = requestedAgents.filter(
      (id) => !serverFilter.agentIds!.includes(id),
    );
    if (outOfScope.length) {
      return {
        ok: false,
        reason: `agent cannot expand to other agent ${outOfScope.join(",")}`,
        code: "SCOPE_EXPANSION_DENIED",
      };
    }
  }

  const forcedCountries = intersectIds(
    serverFilter.countryIds,
    requestedCountries.length ? requestedCountries : undefined,
  );
  const forcedAgents = intersectIds(
    serverFilter.agentIds,
    requestedAgents.length ? requestedAgents : undefined,
  );
  const forcedCities = intersectIds(
    serverFilter.cityIds,
    requestedCities.length ? requestedCities : undefined,
  );

  if (serverFilter.cityIds && requestedCities.some((id) => !serverFilter.cityIds!.includes(id))) {
    return { ok: false, reason: "city scope expansion denied", code: "SCOPE_EXPANSION_DENIED" };
  }

  // Country admin with empty authorized countries → deny
  if (
    (input.actorScope.type === "country" ||
      input.actorScope.type === "agent") &&
    (!forcedCountries || forcedCountries.length === 0)
  ) {
    return {
      ok: false,
      reason: "missing authorized country scope",
      code: "SCOPE_DENIED",
    };
  }

  if (
    input.actorScope.type === "agent" &&
    (!forcedAgents || forcedAgents.length === 0)
  ) {
    return {
      ok: false,
      reason: "missing authorized agent scope",
      code: "SCOPE_DENIED",
    };
  }

  return {
    ok: true,
    serverFilter: {
      countryIds: forcedCountries,
      agentIds: forcedAgents,
      cityIds: forcedCities,
    },
    forced: requestedCountries.length > 0 || requestedAgents.length > 0,
  };
}
