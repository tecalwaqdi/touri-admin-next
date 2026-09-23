/**
 * Server-to-server auth for finance forward auto-finalize.
 *
 * Cloud Functions (and other allowlisted Google SAs) present a Google OIDC
 * ID token with audience = Admin Next production origin.
 * No static shared secrets — metadata-server / WIF identity only.
 */

import { OAuth2Client } from "google-auth-library";
import type { AuthUser } from "@/types/auth";
import { permissionsForRole } from "@/permissions/rbac";

export const FINANCE_FORWARD_S2S_AUDIENCE_DEFAULT =
  "https://touri-admin-next.vercel.app" as const;

/** Production Firebase / Cloud Functions default compute identities. */
export const FINANCE_FORWARD_S2S_ALLOWED_SA_EMAILS_DEFAULT = [
  "tutorial-multi-language-70gx4j@appspot.gserviceaccount.com",
] as const;

export type FinanceForwardS2sActor = {
  user: AuthUser;
  principalEmail: string;
  audience: string;
};

function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(
      parts[1]!.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Peek only — never treat as authenticated. */
export function peekBearerTokenIssuer(token: string): string | null {
  const payload = decodeJwtPayloadUnsafe(token);
  const iss = payload?.iss;
  return typeof iss === "string" ? iss : null;
}

export function isGoogleOidcIssuer(issuer: string | null | undefined): boolean {
  if (!issuer) return false;
  return (
    issuer === "https://accounts.google.com" ||
    issuer === "accounts.google.com"
  );
}

export function resolveFinanceForwardS2sAudience(
  env: Record<string, string | undefined> = process.env,
): string {
  const fromEnv = env.FINANCE_FORWARD_S2S_AUDIENCE?.trim();
  return fromEnv || FINANCE_FORWARD_S2S_AUDIENCE_DEFAULT;
}

export function resolveFinanceForwardS2sAllowedEmails(
  env: Record<string, string | undefined> = process.env,
): ReadonlySet<string> {
  const fromEnv = env.FINANCE_FORWARD_S2S_SA_EMAILS?.trim();
  const list = fromEnv
    ? fromEnv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [...FINANCE_FORWARD_S2S_ALLOWED_SA_EMAILS_DEFAULT];
  return new Set(list.map((e) => e.toLowerCase()));
}

/**
 * Verify Google OIDC ID token for finance-forward S2S callers.
 * Fail-closed on audience / email / email_verified mismatch.
 */
export async function verifyFinanceForwardS2sBearer(input: {
  bearerToken: string;
  audience?: string;
  allowedEmails?: ReadonlySet<string>;
  /** Test injection */
  verifyIdToken?: (args: {
    idToken: string;
    audience: string;
  }) => Promise<{ getPayload: () => Record<string, unknown> | undefined }>;
}): Promise<FinanceForwardS2sActor> {
  const audience =
    input.audience?.trim() || resolveFinanceForwardS2sAudience();
  const allowed =
    input.allowedEmails ?? resolveFinanceForwardS2sAllowedEmails();

  const verify =
    input.verifyIdToken ??
    (async ({ idToken, audience: aud }) => {
      const client = new OAuth2Client();
      const ticket = await client.verifyIdToken({ idToken, audience: aud });
      return {
        getPayload: () =>
          ticket.getPayload() as Record<string, unknown> | undefined,
      };
    });

  let ticket: {
    getPayload: () => Record<string, unknown> | undefined;
  };
  try {
    ticket = await verify({
      idToken: input.bearerToken,
      audience,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verify_failed";
    throw new Error(`finance_forward_s2s_token_invalid:${msg}`);
  }

  const payload = ticket.getPayload() ?? {};
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !allowed.has(email)) {
    throw new Error("finance_forward_s2s_sa_not_allowlisted");
  }
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    // Google SA ID tokens set email_verified=true; require it.
    throw new Error("finance_forward_s2s_email_unverified");
  }

  const user: AuthUser = {
    id: `s2s:${email}`,
    email,
    displayName: `Finance forward S2S (${email})`,
    role: "super_admin",
    permissions: permissionsForRole("super_admin"),
    scope: { type: "global" },
    status: "active",
    locale: "en",
  };

  return { user, principalEmail: email, audience };
}
