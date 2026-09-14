/**
 * Minimal Vercel OIDC → Google Cloud WIF → impersonated SA credential.
 * No service-account private key JSON. Never logs tokens.
 *
 * Env (non-secret resource names):
 * - GCP_WORKLOAD_IDENTITY_PROVIDER
 * - GCP_SERVICE_ACCOUNT_EMAIL
 *
 * Production runtime OIDC token: request-scoped via getVercelOidcToken()
 * from @vercel/oidc during subject-token supply (never read VERCEL_OIDC_TOKEN
 * from process env; never call at module init). Do not use deprecated
 * @vercel/functions/oidc.
 */

import { getVercelOidcToken } from "@vercel/oidc";
import { GoogleAuth, IdentityPoolClient } from "google-auth-library";
import { ProductionCredentialError } from "@/infrastructure/production/credentials/ProductionCredentialProvider";

/** Scopes required by Firestore GAPIC (@google-cloud/firestore-api FirestoreClient.scopes). */
export const FR7_FIRESTORE_GAPIC_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/datastore",
] as const;

export const GCP_WORKLOAD_IDENTITY_PROVIDER_ENV =
  "GCP_WORKLOAD_IDENTITY_PROVIDER" as const;
export const GCP_SERVICE_ACCOUNT_EMAIL_ENV =
  "GCP_SERVICE_ACCOUNT_EMAIL" as const;

/** Preferred least-privilege FR7/Production RO identity (documentation default). */
export const FR7_PREFERRED_SHADOW_READER_SA =
  "touri-admin-next-shadow-reader@tutorial-multi-language-70gx4j.iam.gserviceaccount.com" as const;

const OIDC_TOKEN_MISSING_MESSAGE =
  "FR7_WIF_TOKEN_MISSING: Vercel OIDC token is not available (enable Vercel OIDC federation)" as const;

export type VercelOidcTokenSupplier = () => Promise<string> | string;

export type VercelOidcWifConfig = {
  workloadIdentityProvider: string;
  serviceAccountEmail: string;
  /**
   * Test/local injection only. Production callers must omit this so the
   * request path uses getVercelOidcToken() from @vercel/oidc.
   */
  getOidcToken?: VercelOidcTokenSupplier;
};

export type FirebaseAdminAccessTokenCredential = {
  getAccessToken: () => Promise<{ access_token: string; expires_in: number }>;
};

/**
 * Acquire OIDC subject token during request / token-exchange execution only.
 * Must never be called at module init.
 */
export async function acquireVercelOidcSubjectToken(
  getOidcToken?: VercelOidcTokenSupplier,
): Promise<string> {
  try {
    const raw = getOidcToken
      ? await getOidcToken()
      : await getVercelOidcToken();
    const token = typeof raw === "string" ? raw.trim() : "";
    if (!token) {
      throw new ProductionCredentialError(
        "PRODUCTION_CREDENTIALS_MISSING",
        OIDC_TOKEN_MISSING_MESSAGE,
      );
    }
    return token;
  } catch (err) {
    if (err instanceof ProductionCredentialError) throw err;
    throw new ProductionCredentialError(
      "PRODUCTION_CREDENTIALS_MISSING",
      OIDC_TOKEN_MISSING_MESSAGE,
    );
  }
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
 * Real google-auth-library IdentityPoolClient (BaseExternalAccountClient / AuthClient).
 * OIDC → STS → SA impersonation. No private key JSON. Extends EventEmitter (.on).
 */
export function createVercelOidcWifAuthClient(
  config: VercelOidcWifConfig,
): IdentityPoolClient {
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

  const injectedSupplier = config.getOidcToken;

  return new IdentityPoolClient({
    type: "external_account",
    audience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
    scopes: [...FR7_FIRESTORE_GAPIC_SCOPES],
    subject_token_supplier: {
      // Request-scoped: called by google-auth during STS exchange, never at module load.
      getSubjectToken: async () => acquireVercelOidcSubjectToken(injectedSupplier),
    },
  });
}

/**
 * GoogleAuth wrapper around the real WIF AuthClient for google-gax / FirestoreClient.
 * GAX ClientOptions.auth expects GoogleAuth (getClient / defaultScopes), not a raw AuthClient.
 */
export function createVercelOidcWifGoogleAuth(
  config: VercelOidcWifConfig,
  projectId: string,
): GoogleAuth {
  return new GoogleAuth({
    projectId,
    authClient: createVercelOidcWifAuthClient(config),
    scopes: [...FR7_FIRESTORE_GAPIC_SCOPES],
  });
}

/**
 * Access-token facade over {@link createVercelOidcWifAuthClient}.
 * Prefer AuthClient + GAPIC for Firestore; do not pass this to firebase-admin Firestore.
 */
export function createVercelOidcWifFirebaseCredential(
  config: VercelOidcWifConfig,
): FirebaseAdminAccessTokenCredential {
  const client = createVercelOidcWifAuthClient(config);

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
