/**
 * Minimal Vercel OIDC → Google Cloud WIF → impersonated SA credential.
 * No service-account private key JSON. Never logs tokens.
 *
 * Env (non-secret resource names + runtime OIDC token):
 * - GCP_WORKLOAD_IDENTITY_PROVIDER
 * - GCP_SERVICE_ACCOUNT_EMAIL
 * - VERCEL_OIDC_TOKEN (injected by Vercel when OIDC federation is enabled)
 */

import { IdentityPoolClient } from "google-auth-library";
import { ProductionCredentialError } from "@/infrastructure/production/credentials/ProductionCredentialProvider";

export const GCP_WORKLOAD_IDENTITY_PROVIDER_ENV =
  "GCP_WORKLOAD_IDENTITY_PROVIDER" as const;
export const GCP_SERVICE_ACCOUNT_EMAIL_ENV =
  "GCP_SERVICE_ACCOUNT_EMAIL" as const;
export const VERCEL_OIDC_TOKEN_ENV = "VERCEL_OIDC_TOKEN" as const;

/** Preferred least-privilege FR7/Production RO identity (documentation default). */
export const FR7_PREFERRED_SHADOW_READER_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com" as const;

export type VercelOidcWifConfig = {
  workloadIdentityProvider: string;
  serviceAccountEmail: string;
};

export type FirebaseAdminAccessTokenCredential = {
  getAccessToken: () => Promise<{ access_token: string; expires_in: number }>;
};

function readOidcSubjectToken(): string {
  const token = process.env[VERCEL_OIDC_TOKEN_ENV]?.trim();
  if (!token) {
    throw new ProductionCredentialError(
      "PRODUCTION_CREDENTIALS_MISSING",
      "FR7_WIF_TOKEN_MISSING: VERCEL_OIDC_TOKEN is not available (enable Vercel OIDC federation)",
    );
  }
  return token;
}

/**
 * Returns WIF config when both provider + SA email env vars are set.
 * Partial config → fail closed (do not silently fall back to missing ADC).
 */
export function resolveVercelOidcWifConfig(env: {
  [key: string]: string | undefined;
} = process.env): {
  status: "unset" | "ready" | "incomplete";
  config?: VercelOidcWifConfig;
  missing?: string[];
} {
  const provider = env[GCP_WORKLOAD_IDENTITY_PROVIDER_ENV]?.trim() ?? "";
  const saEmail = env[GCP_SERVICE_ACCOUNT_EMAIL_ENV]?.trim() ?? "";
  if (!provider && !saEmail) {
    return { status: "unset" };
  }
  const missing: string[] = [];
  if (!provider) missing.push(GCP_WORKLOAD_IDENTITY_PROVIDER_ENV);
  if (!saEmail) missing.push(GCP_SERVICE_ACCOUNT_EMAIL_ENV);
  if (missing.length) {
    return { status: "incomplete", missing };
  }
  return {
    status: "ready",
    config: {
      workloadIdentityProvider: provider,
      serviceAccountEmail: saEmail,
    },
  };
}

/**
 * Build a firebase-admin-compatible Credential via WIF + Vercel OIDC.
 * Uses google-auth-library IdentityPoolClient (external_account) — no private keys.
 */
export function createVercelOidcWifFirebaseCredential(
  config: VercelOidcWifConfig,
): FirebaseAdminAccessTokenCredential {
  const providerPath = config.workloadIdentityProvider.replace(
    /^\/\/iam\.googleapis\.com\//,
    "",
  );
  const audience = `//iam.googleapis.com/${providerPath}`;
  const serviceAccountEmail = config.serviceAccountEmail.trim();

  if (!serviceAccountEmail.includes("@") || serviceAccountEmail.includes("BEGIN")) {
    throw new ProductionCredentialError(
      "PRODUCTION_CREDENTIALS_INVALID",
      "GCP_SERVICE_ACCOUNT_EMAIL is invalid",
    );
  }

  const client = new IdentityPoolClient({
    type: "external_account",
    audience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: async () => readOidcSubjectToken(),
    },
  });

  return {
    async getAccessToken() {
      const res = await client.getAccessToken();
      const accessToken = res.token;
      if (!accessToken) {
        throw new ProductionCredentialError(
          "PRODUCTION_CREDENTIALS_MISSING",
          "WIF token exchange returned no access token",
        );
      }
      // IdentityPoolClient caches expiry on credentials; default 1h if unknown.
      const expiry = client.credentials.expiry_date;
      const expiresIn =
        typeof expiry === "number"
          ? Math.max(1, Math.floor((expiry - Date.now()) / 1000))
          : 3600;
      return { access_token: accessToken, expires_in: expiresIn };
    },
  };
}
