/**
 * Admin identity reconciliation — persona (Firestore `user`) vs Auth claims.
 * Never invents claims; mirrors panel_claims derivation.
 */

export const IDENTITY_RECONCILIATION_STATES = [
  "CONSISTENT",
  "CLAIMS_MISSING",
  "PERSONA_MISSING",
  "ROLE_MISMATCH",
  "SCOPE_MISMATCH",
  "DISABLED_MISMATCH",
] as const;

export type IdentityReconciliationState =
  (typeof IDENTITY_RECONCILIATION_STATES)[number];

export type IdentityClaimsMirror = {
  super_admin?: boolean;
  finance?: boolean;
  support?: boolean;
  country_admin?: boolean;
  agent?: boolean;
  country_id?: string | null;
};

export type IdentityPersonaMirror = {
  exists: boolean;
  disabled: boolean;
  expectedClaims: IdentityClaimsMirror;
  roleKey:
    | "super_admin"
    | "country_admin"
    | "accountant"
    | "unsupported"
    | "none";
  countryId: string | null;
};

export type IdentityAuthMirror = {
  exists: boolean;
  disabled: boolean;
  claims: IdentityClaimsMirror;
};

function claimRole(
  claims: IdentityClaimsMirror,
): "super_admin" | "country_admin" | "accountant" | "none" {
  if (claims.super_admin === true) return "super_admin";
  if (claims.country_admin === true) return "country_admin";
  if (claims.finance === true) return "accountant";
  return "none";
}

function normalizeCountry(id: string | null | undefined): string | null {
  if (id == null) return null;
  const t = String(id).trim();
  if (!t) return null;
  const parts = t.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? t;
}

/**
 * Pure reconciliation between Firestore persona expectation and Auth claims.
 */
export function reconcileIdentityState(input: {
  persona: IdentityPersonaMirror;
  auth: IdentityAuthMirror | null;
}): IdentityReconciliationState {
  if (!input.persona.exists) return "PERSONA_MISSING";
  if (!input.auth || !input.auth.exists) return "CLAIMS_MISSING";

  const expectedRole = input.persona.roleKey;
  const actualRole = claimRole(input.auth.claims);
  if (
    expectedRole !== "unsupported" &&
    expectedRole !== "none" &&
    actualRole !== expectedRole
  ) {
    return "ROLE_MISMATCH";
  }

  const expectedCountry = normalizeCountry(input.persona.countryId);
  const actualCountry = normalizeCountry(input.auth.claims.country_id);
  if (
    (expectedRole === "country_admin" ||
      input.persona.expectedClaims.country_admin === true) &&
    expectedCountry !== actualCountry
  ) {
    return "SCOPE_MISMATCH";
  }

  if (input.persona.disabled !== input.auth.disabled) {
    return "DISABLED_MISMATCH";
  }

  return "CONSISTENT";
}
