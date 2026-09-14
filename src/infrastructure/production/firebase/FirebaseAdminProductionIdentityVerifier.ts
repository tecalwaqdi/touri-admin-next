/**
 * Phase 4A-0 — FirebaseAdminProductionIdentityVerifier.
 * Verifies ID tokens via injectable FirebaseAuthAdminClient (Fake in tests).
 * Domain types only — no firebase-admin types leak outward.
 *
 * Rejects x-user-id / x-role / x-country / x-agent as trust in staging/production.
 */

import type {
  IdentityVerificationResult,
  ProductionIdentityVerifier,
  ProductionIdentityVerifierConfig,
  VerifiedIdentity,
  VerifiedIdentityClaims,
} from "@/domain/auth/ProductionIdentityVerifier";
import type { FirebaseAuthAdminClient } from "@/infrastructure/production/firebase/FirebaseProductionContext";

export const UNTRUSTED_IDENTITY_HEADERS = [
  "x-user-id",
  "x-role",
  "x-country",
  "x-agent",
  "x-country-id",
  "x-agent-id",
] as const;

export function assertNoTrustedIdentityHeaders(
  headers: Headers | Record<string, string | null | undefined>,
  env: { APP_ENV: string },
): void {
  if (env.APP_ENV === "development") return;
  const get = (name: string): string | null => {
    if (headers instanceof Headers) return headers.get(name);
    const v = headers[name] ?? headers[name.toLowerCase()];
    return v == null ? null : String(v);
  };
  for (const h of UNTRUSTED_IDENTITY_HEADERS) {
    if (get(h)) {
      throw new Error(
        `UNTRUSTED_IDENTITY_HEADER: ${h} must not be trusted in ${env.APP_ENV}`,
      );
    }
  }
}

/**
 * Test/diagnostic-only classification for invalid_token catch sites.
 * Never attach token, claims, Authorization, or raw Firebase messages.
 */
export type AuthVerifyDiagnosticStage =
  | "VERIFY_ID_TOKEN_EXCEPTION"
  | "GET_USER_EXCEPTION";

export type AuthVerifyDiagnosticEvent = {
  stage: AuthVerifyDiagnosticStage;
  /** Firebase Admin error `.code` only (e.g. auth/id-token-revoked). */
  errorCode: string | null;
};

/** Extract safe SDK error code — never message/stack (may embed secrets). */
export function safeFirebaseAuthErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  if (!("code" in err)) return null;
  const code = (err as { code: unknown }).code;
  if (typeof code !== "string" || !code.trim()) return null;
  // Bound length; codes are short (auth/…)
  return code.trim().slice(0, 128);
}

export type FirebaseAdminProductionIdentityVerifierDeps = {
  authClient: FirebaseAuthAdminClient;
  config: ProductionIdentityVerifierConfig;
  /**
   * When true, call Auth REST getUser after verify (requires ADC).
   * Auth-only Production path must leave this false/undefined.
   */
  checkDisabledViaGetUser?: boolean;
  /**
   * When true, pass checkRevoked to verifyIdToken (requires ADC / Auth REST).
   * Auth-only Production path must leave this false/undefined — signature,
   * issuer, audience, and expiry are still enforced.
   */
  checkRevoked?: boolean;
  now?: () => number;
  /**
   * Test/diagnostic ONLY — called from invalid_token catch paths.
   * Must never log tokens/claims; production HTTP clients never see this.
   */
  diagnosticOnInvalidToken?: (event: AuthVerifyDiagnosticEvent) => void;
};

export class FirebaseAdminProductionIdentityVerifier
  implements ProductionIdentityVerifier
{
  private readonly now: () => number;

  constructor(private readonly deps: FirebaseAdminProductionIdentityVerifierDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  async verify(token: string): Promise<IdentityVerificationResult> {
    if (!token || !token.trim()) {
      return { ok: false, reason: "missing_token", message: "Missing ID token" };
    }

    let decoded;
    try {
      decoded = await this.deps.authClient.verifyIdToken(
        token,
        this.deps.checkRevoked === true,
      );
    } catch (err) {
      this.deps.diagnosticOnInvalidToken?.({
        stage: "VERIFY_ID_TOKEN_EXCEPTION",
        errorCode: safeFirebaseAuthErrorCode(err),
      });
      const code = safeFirebaseAuthErrorCode(err);
      if (code === "auth/id-token-expired") {
        return {
          ok: false,
          reason: "expired_token",
          message: "Token expired",
        };
      }
      // Do NOT collapse SDK/network/credential failures to invalid_token —
      // that caused Phase 5G Auth false negatives when direct Admin verify passed.
      return {
        ok: false,
        reason: "token_verification_failed",
        message: "Token signature verification failed",
      };
    }

    if (!decoded?.uid || typeof decoded.uid !== "string") {
      return {
        ok: false,
        reason: "malformed_claims",
        message: "Token missing uid",
      };
    }

    if (decoded.iss !== this.deps.config.expectedIssuer) {
      return {
        ok: false,
        reason: "wrong_issuer",
        message: "Token issuer mismatch",
      };
    }

    const aud = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
    if (aud !== this.deps.config.expectedAudience) {
      return {
        ok: false,
        reason: "wrong_audience",
        message: "Token audience mismatch",
      };
    }

    const skewMs = (this.deps.config.clockSkewSeconds ?? 60) * 1000;
    const expMs = Number(decoded.exp) * 1000;
    if (!Number.isFinite(expMs) || expMs + skewMs < this.now()) {
      return { ok: false, reason: "expired_token", message: "Token expired" };
    }

    const authTimeSec = Number(decoded.auth_time ?? decoded.iat);
    if (!Number.isFinite(authTimeSec) || authTimeSec <= 0) {
      return {
        ok: false,
        reason: "malformed_claims",
        message: "Token missing auth_time",
      };
    }

    let disabled = decoded.disabled === true;
    let emailVerified = decoded.email_verified === true;
    if (this.deps.checkDisabledViaGetUser && this.deps.authClient.getUser) {
      try {
        const user = await this.deps.authClient.getUser(decoded.uid);
        disabled = user.disabled;
        emailVerified = user.emailVerified;
      } catch (err) {
        this.deps.diagnosticOnInvalidToken?.({
          stage: "GET_USER_EXCEPTION",
          errorCode: safeFirebaseAuthErrorCode(err),
        });
        // Distinct from verify failure — valid token can still fail getUser.
        return {
          ok: false,
          reason: "user_lookup_failed",
          message: "Unable to load user record",
        };
      }
    }

    if (disabled) {
      return {
        ok: false,
        reason: "disabled_user",
        message: "User account is disabled",
      };
    }

    const claims = normalizeClaims(decoded);
    const identity: VerifiedIdentity = {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : null,
      emailVerified,
      disabled: false,
      claims,
      issuedAt: new Date(Number(decoded.iat) * 1000),
      expiresAt: new Date(expMs),
      authTime: new Date(authTimeSec * 1000),
      issuer: decoded.iss,
      audience: String(aud),
    };

    return { ok: true, identity };
  }
}

const KNOWN_BOOL_CLAIMS = [
  "super_admin",
  "finance",
  "support",
  "country_admin",
  "agent",
  "partner",
  "transport_manager",
] as const;

const KNOWN_STRING_CLAIMS = [
  "country_id",
  "agent_id",
  "partner_mkan_id",
  "transport_company_id",
] as const;

function normalizeClaims(decoded: Record<string, unknown>): VerifiedIdentityClaims {
  const claims: VerifiedIdentityClaims = {};
  for (const key of KNOWN_BOOL_CLAIMS) {
    if (typeof decoded[key] === "boolean") {
      claims[key] = decoded[key] as boolean;
    }
  }
  for (const key of KNOWN_STRING_CLAIMS) {
    if (typeof decoded[key] === "string") {
      claims[key] = decoded[key] as string;
    }
  }
  // Preserve unknown claim keys without elevating them
  for (const [k, v] of Object.entries(decoded)) {
    if (
      k === "uid" ||
      k === "email" ||
      k === "email_verified" ||
      k === "iss" ||
      k === "aud" ||
      k === "exp" ||
      k === "iat" ||
      k === "auth_time" ||
      k === "disabled" ||
      k === "sub" ||
      k === "user_id" ||
      k === "firebase"
    ) {
      continue;
    }
    if (!(k in claims)) {
      claims[k] = v;
    }
  }
  return claims;
}

/** Fake Auth Admin client for unit tests. */
export class FakeFirebaseAuthAdminClient implements FirebaseAuthAdminClient {
  constructor(
    private readonly byToken: Record<
      string,
      | import("./FirebaseProductionContext").DecodedIdTokenClaims
      | { error: Error }
    > = {},
  ) {}

  async verifyIdToken(token: string) {
    const entry = this.byToken[token];
    if (!entry) {
      throw new Error("invalid token");
    }
    if ("error" in entry) {
      throw entry.error;
    }
    return entry;
  }
}
