/**
 * Phase 3.7 — Production Identity Verifier contract.
 * NO Firebase Admin SDK. NO live production verification.
 * FakeProductionIdentityVerifier is for unit tests ONLY.
 */

export type VerifiedIdentityClaims = {
  /** Legacy custom claims (panel_claims.deriveClaimsFromUserData) */
  super_admin?: boolean;
  finance?: boolean;
  support?: boolean;
  country_admin?: boolean;
  agent?: boolean;
  partner?: boolean;
  transport_manager?: boolean;
  country_id?: string;
  /** Agent document / persona id when distinct from uid */
  agent_id?: string;
  partner_mkan_id?: string;
  transport_company_id?: string;
  /** Catch-all for unknown claim keys — never auto-elevated */
  [key: string]: unknown;
};

export type VerifiedIdentity = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  disabled: boolean;
  claims: VerifiedIdentityClaims;
  issuedAt: Date;
  expiresAt: Date;
  authTime: Date;
  issuer: string;
  audience: string;
};

export type IdentityVerificationFailureReason =
  | "missing_token"
  | "invalid_token"
  /** verifyIdToken threw (signature/revocation/network/credential) — not a catch-all. */
  | "token_verification_failed"
  /** getUser threw after verify succeeded — do not collapse to invalid_token. */
  | "user_lookup_failed"
  | "expired_token"
  | "wrong_audience"
  | "wrong_issuer"
  | "disabled_user"
  | "malformed_claims"
  | "verifier_unavailable";

export type IdentityVerificationResult =
  | { ok: true; identity: VerifiedIdentity }
  | {
      ok: false;
      reason: IdentityVerificationFailureReason;
      message: string;
    };

export type ProductionIdentityVerifierConfig = {
  expectedIssuer: string;
  expectedAudience: string;
  /** Clock skew tolerance in seconds (design default 60). */
  clockSkewSeconds?: number;
};

/**
 * Production contract: verify a Bearer ID token → VerifiedIdentity.
 * Future Phase 4 may wrap Firebase Admin verifyIdToken — NOT in 3.7.
 */
export interface ProductionIdentityVerifier {
  verify(token: string): Promise<IdentityVerificationResult>;
}

export type FakeIdentityEntry =
  | VerifiedIdentity
  | { error: Extract<IdentityVerificationResult, { ok: false }> };

/**
 * Test-only verifier. Never talks to Firebase / network.
 */
export class FakeProductionIdentityVerifier
  implements ProductionIdentityVerifier
{
  constructor(
    private readonly tokens: Record<string, FakeIdentityEntry> = {},
    private readonly config: ProductionIdentityVerifierConfig = {
      expectedIssuer: "https://securetoken.google.com/fake-project",
      expectedAudience: "fake-project",
    },
  ) {}

  async verify(token: string): Promise<IdentityVerificationResult> {
    if (!token || !token.trim()) {
      return { ok: false, reason: "missing_token", message: "Missing ID token" };
    }
    const entry = this.tokens[token];
    if (!entry) {
      return { ok: false, reason: "invalid_token", message: "Unknown token" };
    }
    if ("error" in entry) {
      return entry.error;
    }
    const identity = entry;
    if (identity.disabled) {
      return {
        ok: false,
        reason: "disabled_user",
        message: "User account is disabled",
      };
    }
    if (identity.issuer !== this.config.expectedIssuer) {
      return {
        ok: false,
        reason: "wrong_issuer",
        message: "Token issuer mismatch",
      };
    }
    if (identity.audience !== this.config.expectedAudience) {
      return {
        ok: false,
        reason: "wrong_audience",
        message: "Token audience mismatch",
      };
    }
    const skewMs = (this.config.clockSkewSeconds ?? 60) * 1000;
    if (identity.expiresAt.getTime() + skewMs < Date.now()) {
      return { ok: false, reason: "expired_token", message: "Token expired" };
    }
    if (!identity.claims || typeof identity.claims !== "object") {
      return {
        ok: false,
        reason: "malformed_claims",
        message: "Claims missing or malformed",
      };
    }
    return { ok: true, identity };
  }
}

export function buildVerifiedIdentity(
  partial: Partial<VerifiedIdentity> &
    Pick<VerifiedIdentity, "uid"> & { claims?: VerifiedIdentityClaims },
  config: ProductionIdentityVerifierConfig = {
    expectedIssuer: "https://securetoken.google.com/fake-project",
    expectedAudience: "fake-project",
  },
): VerifiedIdentity {
  const now = Date.now();
  return {
    uid: partial.uid,
    email: partial.email ?? null,
    emailVerified: partial.emailVerified ?? true,
    disabled: partial.disabled ?? false,
    claims: partial.claims ?? {},
    issuedAt: partial.issuedAt ?? new Date(now - 60_000),
    expiresAt: partial.expiresAt ?? new Date(now + 3_600_000),
    authTime: partial.authTime ?? new Date(now - 60_000),
    issuer: partial.issuer ?? config.expectedIssuer,
    audience: partial.audience ?? config.expectedAudience,
  };
}
