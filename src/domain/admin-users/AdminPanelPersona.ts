/**
 * PC-4 — Classify Legacy `user` docs as Admin panel personas for directory RO.
 * Uses the same claim derivation mirror as panel_claims (Phase 5I) + mapClaimsToIdentity.
 * Does NOT repair Production data; emits DQ warnings for unmapped/invalid mappings.
 */

import { deriveExpectedCustomClaimsFromUserData } from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";
import {
  mapClaimsToIdentity,
  type MappedAuthIdentity,
} from "@/domain/auth/ProductionAuthDesign";
import type { AccessScope, Role } from "@/types/roles";
import { permissionsForRole } from "@/permissions/rbac";

export type AdminPanelPersonaClassification =
  | {
      included: true;
      role: Role;
      scope: AccessScope;
      permissionCount: number;
      mapped: MappedAuthIdentity;
      dataQualityWarnings: string[];
      legacyRule: number;
      isAdminFlag: boolean;
      isAgentFlag: boolean;
    }
  | {
      included: false;
      reason: string;
      dataQualityWarnings: string[];
    };

function normalizeAdminRule(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extractCountryPath(data: Record<string, unknown>): string | null {
  const ref = (data.Rev_dloh_agent ?? data.Rev_dolh) as
    | { path?: unknown }
    | string
    | null
    | undefined;
  if (typeof ref === "string" && ref.trim()) return ref.trim();
  if (ref && typeof ref === "object" && typeof ref.path === "string") {
    return ref.path;
  }
  return null;
}

/**
 * True when Firestore markers indicate a panel-admin candidate worth classifying.
 * Pure drivers/customers without admin markers are excluded before mapping.
 */
export function looksLikeAdminPanelPersona(
  data: Record<string, unknown>,
): boolean {
  const rule = normalizeAdminRule(data.isAdminRule ?? data.IsAdminRule);
  if (data.IsAdmin === true || data.isAdmin === true) return true;
  if (rule === 1 || rule === 2 || rule === 5) return true;
  // support-only rare; include when explicit support flag without driver-only
  if (data.support === true && data.ismndob !== true) return true;
  return false;
}

/**
 * Map a Legacy user document → Admin Next directory row or exclusion.
 */
export function classifyAdminPanelPersona(input: {
  id: string;
  data: Record<string, unknown>;
  email?: string | null;
}): AdminPanelPersonaClassification {
  const { id, data } = input;
  const warnings: string[] = [];
  const rule = normalizeAdminRule(data.isAdminRule ?? data.IsAdminRule);
  const isAdminFlag = data.IsAdmin === true || data.isAdmin === true;
  const isAgentFlag = data.Isagent === true || data.isagent === true;

  // Unsupported legacy roles — do not invent Admin Next roles.
  if (rule === 3 || rule === 4) {
    warnings.push("unsupported_legacy_role");
    return {
      included: false,
      reason: rule === 3 ? "unsupported_partner" : "unsupported_transport_manager",
      dataQualityWarnings: warnings,
    };
  }

  if (!looksLikeAdminPanelPersona(data)) {
    return {
      included: false,
      reason: "not_admin_panel_persona",
      dataQualityWarnings: warnings,
    };
  }

  const derived = deriveExpectedCustomClaimsFromUserData(data);
  const countryPath = extractCountryPath(data);
  if (
    (derived.country_admin === true || derived.agent === true) &&
    !derived.country_id &&
    countryPath
  ) {
    derived.country_id = countryPath;
  }

  const mapped = mapClaimsToIdentity({
    uid: id,
    email:
      typeof input.email === "string"
        ? input.email
        : typeof data.email === "string"
          ? data.email
          : undefined,
    super_admin: derived.super_admin === true,
    finance: derived.finance === true,
    support: derived.support === true,
    country_admin: derived.country_admin === true,
    agent: derived.agent === true,
    partner: derived.partner === true,
    transport_manager: derived.transport_manager === true,
    country_id:
      typeof derived.country_id === "string" ? derived.country_id : undefined,
  });

  if ("deny" in mapped && mapped.deny) {
    warnings.push(`unmapped_or_invalid:${mapped.reason}`);
    return {
      included: false,
      reason: mapped.reason,
      dataQualityWarnings: warnings,
    };
  }

  const identity = mapped as MappedAuthIdentity;
  if (isAgentFlag && identity.role === "country_admin") {
    warnings.push("agent_flag_coexists_with_country_admin");
  }
  if (isAdminFlag && rule !== 0 && rule !== 1) {
    warnings.push("isAdmin_flag_with_non_super_rule");
  }
  if (!identity.scope.countryIds?.length && identity.scope.type === "country") {
    warnings.push("missing_country_scope");
  }

  return {
    included: true,
    role: identity.role,
    scope: identity.scope,
    permissionCount: permissionsForRole(identity.role).length,
    mapped: identity,
    dataQualityWarnings: warnings,
    legacyRule: rule,
    isAdminFlag,
    isAgentFlag,
  };
}

export function resolveAdminUserStatus(
  data: Record<string, unknown>,
): "active" | "disabled" | "unknown" {
  if (data.disabled === true || data.account_disabled === true) {
    return "disabled";
  }
  if (data.actev_user === false || data.active === false) {
    return "disabled";
  }
  if (
    data.actev_user === true ||
    data.active === true ||
    data.IsAdmin === true ||
    data.isAdmin === true
  ) {
    return "active";
  }
  return "unknown";
}

export function resolveAdminDisplayName(
  data: Record<string, unknown>,
  id: string,
): string {
  for (const key of ["display_name", "displayName", "name", "full_name"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return id;
}
