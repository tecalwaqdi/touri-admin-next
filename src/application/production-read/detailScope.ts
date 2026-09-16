/**
 * PC-2 — authoritative detail scope checks (IDOR / country_admin / agent_user).
 * Country IDs compared via canonical equality (SA ≡ saudi_arabia).
 */

import type { AccessScope } from "@/types/roles";
import { countryIdsEqual, tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { ScopeDeniedError } from "@/infrastructure/production/repositories/productionReadHelpers";

export type DetailScopeResource = {
  countryId?: string | null;
  agentId?: string | null;
  cityId?: string | null;
};

/** True when resource country is within actor country list (canonical). */
export function countryIdAllowedByScope(
  scopeCountryIds: string[] | undefined,
  resourceCountryId: string | null | undefined,
): boolean {
  if (!scopeCountryIds?.length) return false;
  if (!resourceCountryId) return false;
  return scopeCountryIds.some((id) => countryIdsEqual(id, resourceCountryId));
}

/**
 * Fail-closed detail scope. Missing country for country/agent actors → deny.
 * Does not trust UI visibility.
 */
export function assertDetailResourceInScope(
  scope: AccessScope,
  resource: DetailScopeResource,
): void {
  switch (scope.type) {
    case "global":
      return;
    case "country": {
      if (!countryIdAllowedByScope(scope.countryIds, resource.countryId)) {
        throw new ScopeDeniedError("resource outside authorized country scope");
      }
      return;
    }
    case "city": {
      if (!resource.cityId || !(scope.cityIds ?? []).includes(resource.cityId)) {
        throw new ScopeDeniedError("resource outside authorized city scope");
      }
      return;
    }
    case "agent": {
      if (
        !resource.agentId ||
        !(scope.agentIds ?? []).includes(resource.agentId)
      ) {
        throw new ScopeDeniedError("resource outside authorized agent scope");
      }
      if (
        scope.countryIds?.length &&
        !countryIdAllowedByScope(scope.countryIds, resource.countryId)
      ) {
        throw new ScopeDeniedError(
          "resource outside authorized agent country scope",
        );
      }
      return;
    }
    default:
      throw new ScopeDeniedError("unknown scope type");
  }
}

/** Normalize actor country ids for diagnostics (best-effort). */
export function actorCanonicalCountryIds(scope: AccessScope): string[] {
  return (scope.countryIds ?? [])
    .map((id) => tryCanonicalCountryId(id))
    .filter((id): id is string => id != null);
}

/** Shared related-read ceiling for PC-2 detail responses. */
export const PRODUCTION_DETAIL_RELATED_READ_LIMIT = 20;
