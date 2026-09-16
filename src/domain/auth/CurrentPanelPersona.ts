import type { MappedAuthIdentity } from "@/domain/auth/ProductionAuthDesign";
import { classifyAdminPanelPersona, resolveAdminUserStatus } from "@/domain/admin-users/AdminPanelPersona";
import { canonicalizeCountryIdList } from "@/domain/geography/CanonicalCountryId";

/** A signed but stale role/scope must not survive a persona change or disable. */
export function currentPanelPersonaMatches(identity: MappedAuthIdentity, data: Record<string, unknown> | null): boolean {
  if (!data || resolveAdminUserStatus(data) === "disabled") return false;
  const persona = classifyAdminPanelPersona({ id: identity.uid, data });
  if (!persona.included || persona.role !== identity.role || persona.scope.type !== identity.scope.type) return false;
  try {
    const equal = (a: string[] = [], b: string[] = []) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
    return equal(canonicalizeCountryIdList(persona.scope.countryIds ?? []), canonicalizeCountryIdList(identity.scope.countryIds ?? [])) &&
      equal(persona.scope.agentIds, identity.scope.agentIds) && equal(persona.scope.cityIds, identity.scope.cityIds);
  } catch { return false; }
}
