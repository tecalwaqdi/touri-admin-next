/**
 * Phase 3.7 Production Auth Design — claims mapping + fail-closed resolve.
 * Builds on ProductionIdentityVerifier. NO Firebase Admin SDK connection.
 *
 * Flow (design): Browser → Firebase Auth → ID Token → Backend verify(token)
 * → VerifiedIdentity → mapClaimsToIdentity → RBAC → Scope → Repository.
 *
 * NEVER trust browser headers x-user-id / x-role / x-country / x-agent
 * in staging/production (see apiAuth + AUTH_MODE startup guard).
 */

import type { AccessScope, Permission, Role } from "@/types/roles";
import { permissionsForRole } from "@/permissions/rbac";
import {
  type ProductionIdentityVerifier,
  type VerifiedIdentity,
  type VerifiedIdentityClaims,
  FakeProductionIdentityVerifier,
  buildVerifiedIdentity,
} from "@/domain/auth/ProductionIdentityVerifier";

/** @deprecated Prefer VerifiedIdentityClaims — kept for Phase 3.5 test compat */
export type VerifiedIdTokenClaims = {
  uid: string;
  email?: string;
  super_admin?: boolean;
  finance?: boolean;
  support?: boolean;
  country_admin?: boolean;
  agent?: boolean;
  partner?: boolean;
  transport_manager?: boolean;
  country_id?: string;
  agent_id?: string;
  partner_mkan_id?: string;
  transport_company_id?: string;
  exp?: number;
  iat?: number;
};

export type TokenVerificationResult =
  | { ok: true; claims: VerifiedIdTokenClaims }
  | {
      ok: false;
      reason:
        | "invalid_token"
        | "expired_token"
        | "missing_token"
        | "unknown_claim_role"
        | "missing_scope"
        | "verifier_unavailable"
        | "wrong_audience"
        | "wrong_issuer"
        | "disabled_user"
        | "malformed_claims";
      message: string;
    };

/** @deprecated Prefer ProductionIdentityVerifier */
export interface IdTokenVerifier {
  verifyIdToken(idToken: string): Promise<TokenVerificationResult>;
}

export type MappedAuthIdentity = {
  uid: string;
  email: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

export type AuthClaimMappingRow = {
  legacyClaimOrRule: string;
  adminNextRole: Role | null;
  adminNextScope: AccessScope["type"] | null;
  confidence: "high" | "medium" | "low" | "unknown";
  migrationConcern: string;
};

/**
 * Legacy claim → Admin Next role/scope mapping table (design + enforcement).
 * Evidence: admin/Admi/firebase/functions/panel_claims.js
 */
export const AUTH_CLAIM_MAPPING_TABLE: AuthClaimMappingRow[] = [
  {
    legacyClaimOrRule: "isAdminRule=1 / isAdmin=true → super_admin claim",
    adminNextRole: "super_admin",
    adminNextScope: "global",
    confidence: "high",
    migrationConcern:
      "Global ONLY via verified claims.super_admin after token verify — never from browser isAdmin header",
  },
  {
    legacyClaimOrRule: "isAdminRule=2 / country_admin claim",
    adminNextRole: "country_admin",
    adminNextScope: "country",
    confidence: "high",
    migrationConcern: "Require country_id; Legacy does NOT grant finance",
  },
  {
    legacyClaimOrRule: "isAdminRule=3 / partner claim",
    adminNextRole: null,
    adminNextScope: null,
    confidence: "low",
    migrationConcern: "unsupported_legacy_role → DENY (no Admin Next partner role)",
  },
  {
    legacyClaimOrRule: "isAdminRule=4 / transport_manager claim",
    adminNextRole: null,
    adminNextScope: null,
    confidence: "low",
    migrationConcern: "unsupported_legacy_role → DENY",
  },
  {
    legacyClaimOrRule: "isAdminRule=5 / finance claim (accountant)",
    adminNextRole: "accountant",
    adminNextScope: "global",
    confidence: "medium",
    migrationConcern: "Legacy finance claim is read-only persona; scope may need country",
  },
  {
    legacyClaimOrRule: "agent / Isagent → agent claim",
    adminNextRole: "agent_user",
    adminNextScope: "agent",
    confidence: "high",
    migrationConcern: "Require agentId + countryId + agent-belongs-to-country domain check",
  },
  {
    legacyClaimOrRule: "support claim (alone)",
    adminNextRole: "support_agent",
    adminNextScope: "global",
    confidence: "medium",
    migrationConcern: "Often bundled; alone is rare",
  },
  {
    legacyClaimOrRule: "country_id claim path (Rev_dloh_agent / Rev_dolh)",
    adminNextRole: null,
    adminNextScope: "country",
    confidence: "high",
    migrationConcern: "Normalize countries/{id} path → countryIds[]",
  },
];

export type AgentCountryMembership = {
  agentId: string;
  countryId: string;
};

/**
 * Domain check: agent belongs to country.
 * Phase 3.7 uses Fake / fixture lookup only — no production Firestore.
 */
export interface AgentCountryMembershipChecker {
  agentBelongsToCountry(
    agentId: string,
    countryId: string,
  ): Promise<boolean> | boolean;
}

export class FakeAgentCountryMembershipChecker
  implements AgentCountryMembershipChecker
{
  constructor(private readonly memberships: AgentCountryMembership[] = []) {}

  agentBelongsToCountry(agentId: string, countryId: string): boolean {
    return this.memberships.some(
      (m) => m.agentId === agentId && m.countryId === countryId,
    );
  }
}

export type MapClaimsOptions = {
  agentMembership?: AgentCountryMembershipChecker;
};

/**
 * Fail-closed claim → identity mapping.
 * Rules:
 * - unknown claim ≠ admin
 * - unknown / unsupported role ≠ viewer → DENY
 * - missing scope ≠ global → DENY
 * - Super Admin: only VerifiedIdentity.claims.super_admin (Legacy evidence: isAdmin/rule1 → claim)
 */
export function mapClaimsToIdentity(
  claims: VerifiedIdTokenClaims | (VerifiedIdentityClaims & { uid: string; email?: string }),
  options: MapClaimsOptions = {},
): MappedAuthIdentity | { deny: true; reason: string } {
  const uid = "uid" in claims ? String(claims.uid) : "";
  if (!uid) {
    return { deny: true, reason: "malformed_claims:missing uid" };
  }

  let role: Role | null = null;
  let scope: AccessScope | null = null;

  if (claims.super_admin === true) {
    // Decision (documented): Legacy panel_claims sets super_admin from isAdmin||rule1.
    // Admin Next grants global ONLY when verified token carries claims.super_admin=true.
    // Client-sent isAdmin / x-role=super_admin MUST NOT grant global.
    role = "super_admin";
    scope = { type: "global" };
  } else if (claims.country_admin === true) {
    role = "country_admin";
    if (!claims.country_id) {
      return {
        deny: true,
        reason: "missing_scope:country_id required for country_admin",
      };
    }
    scope = {
      type: "country",
      countryIds: [normalizeCountryId(String(claims.country_id))],
    };
  } else if (claims.agent === true) {
    role = "agent_user";
    if (!claims.country_id) {
      return {
        deny: true,
        reason: "missing_scope:country_id required for agent",
      };
    }
    const agentId =
      typeof claims.agent_id === "string" && claims.agent_id.trim()
        ? claims.agent_id.trim()
        : uid;
    if (!agentId) {
      return { deny: true, reason: "missing_scope:agent_id required for agent" };
    }
    const countryId = normalizeCountryId(String(claims.country_id));
    if (options.agentMembership) {
      const ok = options.agentMembership.agentBelongsToCountry(
        agentId,
        countryId,
      );
      // Sync Fake returns boolean; Promise path handled by mapClaimsToIdentityAsync
      if (ok instanceof Promise) {
        return {
          deny: true,
          reason:
            "missing_scope:use mapClaimsToIdentityAsync for async membership check",
        };
      }
      if (!ok) {
        return {
          deny: true,
          reason: "missing_scope:agent does not belong to country",
        };
      }
    }
    scope = {
      type: "agent",
      countryIds: [countryId],
      agentIds: [agentId],
    };
  } else if (claims.finance === true) {
    role = "accountant";
    scope = { type: "global" };
  } else if (claims.support === true) {
    role = "support_agent";
    scope = { type: "global" };
  } else if (claims.partner === true || claims.transport_manager === true) {
    return {
      deny: true,
      reason:
        "unsupported_legacy_role:partner/transport_manager not mapped in Admin Next",
    };
  } else {
    return {
      deny: true,
      reason: "unknown_claim_role:no recognized admin claim (unknown ≠ admin/viewer)",
    };
  }

  if (!role || !scope) {
    return { deny: true, reason: "unknown_claim_role" };
  }

  return {
    uid,
    email: typeof claims.email === "string" ? claims.email : "",
    role,
    permissions: permissionsForRole(role),
    scope,
  };
}

export async function mapClaimsToIdentityAsync(
  claims: VerifiedIdTokenClaims | (VerifiedIdentityClaims & { uid: string; email?: string }),
  options: MapClaimsOptions = {},
): Promise<MappedAuthIdentity | { deny: true; reason: string }> {
  if (
    claims.agent === true &&
    claims.super_admin !== true &&
    claims.country_admin !== true &&
    options.agentMembership
  ) {
    const uid = String(claims.uid);
    const agentId =
      typeof claims.agent_id === "string" && claims.agent_id.trim()
        ? claims.agent_id.trim()
        : uid;
    if (!claims.country_id) {
      return {
        deny: true,
        reason: "missing_scope:country_id required for agent",
      };
    }
    const countryId = normalizeCountryId(String(claims.country_id));
    const belongs = await Promise.resolve(
      options.agentMembership.agentBelongsToCountry(agentId, countryId),
    );
    if (!belongs) {
      return {
        deny: true,
        reason: "missing_scope:agent does not belong to country",
      };
    }
    return {
      uid,
      email: typeof claims.email === "string" ? claims.email : "",
      role: "agent_user",
      permissions: permissionsForRole("agent_user"),
      scope: {
        type: "agent",
        countryIds: [countryId],
        agentIds: [agentId],
      },
    };
  }
  return mapClaimsToIdentity(claims, options);
}

export function mapVerifiedIdentityToActor(
  identity: VerifiedIdentity,
  options: MapClaimsOptions = {},
): MappedAuthIdentity | { deny: true; reason: string } {
  if (identity.disabled) {
    return { deny: true, reason: "disabled_user" };
  }
  return mapClaimsToIdentity(
    {
      uid: identity.uid,
      email: identity.email ?? undefined,
      ...identity.claims,
    },
    options,
  );
}

function normalizeCountryId(pathOrId: string): string {
  const s = pathOrId.trim();
  if (s.includes("/")) {
    const parts = s.split("/");
    return parts[parts.length - 1] || s;
  }
  return s;
}

/**
 * Adapter: FakeIdTokenVerifier → legacy Phase 3.5 tests.
 * Prefer FakeProductionIdentityVerifier for Phase 3.7+.
 */
export class FakeIdTokenVerifier implements IdTokenVerifier {
  constructor(
    private readonly tokens: Record<
      string,
      VerifiedIdTokenClaims | { error: TokenVerificationResult & { ok: false } }
    > = {},
  ) {}

  async verifyIdToken(idToken: string): Promise<TokenVerificationResult> {
    if (!idToken) {
      return { ok: false, reason: "missing_token", message: "Missing ID token" };
    }
    const entry = this.tokens[idToken];
    if (!entry) {
      return { ok: false, reason: "invalid_token", message: "Unknown token" };
    }
    if ("error" in entry) {
      return entry.error;
    }
    if (entry.exp != null && entry.exp * 1000 < Date.now()) {
      return { ok: false, reason: "expired_token", message: "Token expired" };
    }
    return { ok: true, claims: entry };
  }
}

export async function resolveActorFromIdToken(
  verifier: IdTokenVerifier,
  idToken: string | null | undefined,
): Promise<
  | { ok: true; identity: MappedAuthIdentity }
  | { ok: false; reason: string }
> {
  if (!idToken) {
    return { ok: false, reason: "missing_token" };
  }
  const verified = await verifier.verifyIdToken(idToken);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason };
  }
  const mapped = mapClaimsToIdentity(verified.claims);
  if ("deny" in mapped) {
    return { ok: false, reason: mapped.reason };
  }
  return { ok: true, identity: mapped };
}

/**
 * Phase 3.7 resolve: ProductionIdentityVerifier → MappedAuthIdentity.
 */
export async function resolveActorFromVerifiedToken(
  verifier: ProductionIdentityVerifier,
  idToken: string | null | undefined,
  options: MapClaimsOptions = {},
): Promise<
  | { ok: true; identity: MappedAuthIdentity; verified: VerifiedIdentity }
  | { ok: false; reason: string }
> {
  if (!idToken) {
    return { ok: false, reason: "missing_token" };
  }
  const verified = await verifier.verify(idToken);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason };
  }
  const mapped = await mapClaimsToIdentityAsync(
    {
      uid: verified.identity.uid,
      email: verified.identity.email ?? undefined,
      ...verified.identity.claims,
    },
    options,
  );
  if ("deny" in mapped) {
    return { ok: false, reason: mapped.reason };
  }
  return { ok: true, identity: mapped, verified: verified.identity };
}

export {
  FakeProductionIdentityVerifier,
  buildVerifiedIdentity,
};
export type { ProductionIdentityVerifier, VerifiedIdentity };
