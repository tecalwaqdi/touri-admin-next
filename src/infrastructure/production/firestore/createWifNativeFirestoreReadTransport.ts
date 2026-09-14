/**
 * Shared factory: Vercel OIDC WIF → GoogleAuth → WIF-native Firestore read transport.
 * Used by FR7 finance RO and operational Production read repositories.
 * No SA JSON. Incomplete WIF fails closed (no silent ADC on Production intent).
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  createVercelOidcWifGoogleAuth,
  resolveVercelOidcWifConfig,
} from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import {
  Fr7WifNativeFirestoreReadTransport,
  type Fr7FirestoreReadRpcClient,
} from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { WifNativeFirestoreReadClient } from "@/infrastructure/production/firestore/WifNativeFirestoreReadClient";

export class WifNativeFirestoreReadError extends Error {
  readonly code:
    | "WIF_RO_FIREBASE_UNREACHABLE"
    | "WIF_ADC_MISSING"
    | "WIF_CONFIG_INCOMPLETE"
    | "WIF_TOKEN_MISSING"
    | "WIF_CREDENTIALS_INVALID"
    | "WIF_PROJECT_MISMATCH";
  constructor(
    message: string,
    code: WifNativeFirestoreReadError["code"] = "WIF_RO_FIREBASE_UNREACHABLE",
  ) {
    super(message);
    this.name = "WifNativeFirestoreReadError";
    this.code = code;
  }
}

export type WifNativeReadCredentialKind =
  | "application_default"
  | "vercel_oidc_wif";

export type CreateWifNativeFirestoreReadResult = {
  transport: Fr7WifNativeFirestoreReadTransport;
  client: WifNativeFirestoreReadClient;
  kind: WifNativeReadCredentialKind;
};

/**
 * Create shared WIF-native read transport + FirestoreReadClient.
 * Prefer Vercel OIDC WIF. Local ADC only when WIF unset (operator harness / local).
 * Production Vercel must set WIF env — incomplete WIF fails closed.
 */
export async function createWifNativeFirestoreRead(input: {
  projectId: string;
  /** When true, refuse ADC fallback (Production API path). */
  requireWif?: boolean;
  rpcClient?: Fr7FirestoreReadRpcClient;
}): Promise<CreateWifNativeFirestoreReadResult> {
  const projectId = input.projectId.trim();
  if (!projectId) {
    throw new WifNativeFirestoreReadError(
      "projectId required for WIF-native Firestore read",
      "WIF_CREDENTIALS_INVALID",
    );
  }

  if (input.rpcClient) {
    const transport = new Fr7WifNativeFirestoreReadTransport({
      projectId,
      rpcClient: input.rpcClient,
    });
    return {
      kind: "vercel_oidc_wif",
      transport,
      client: new WifNativeFirestoreReadClient({
        projectId,
        rpcClient: input.rpcClient,
      }),
    };
  }

  const wif = resolveVercelOidcWifConfig();
  if (wif.status === "incomplete") {
    throw new WifNativeFirestoreReadError(
      `WIF_CONFIG_INCOMPLETE: missing ${wif.missing?.join(",") ?? "WIF env"}`,
      "WIF_CONFIG_INCOMPLETE",
    );
  }

  if (wif.status === "ready" && wif.config) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      throw new WifNativeFirestoreReadError(
        "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS (use Vercel OIDC WIF)",
        "WIF_CREDENTIALS_INVALID",
      );
    }
    const auth = createVercelOidcWifGoogleAuth(wif.config, projectId);
    const transport = new Fr7WifNativeFirestoreReadTransport({
      projectId,
      auth,
    });
    return {
      kind: "vercel_oidc_wif",
      transport,
      client: new WifNativeFirestoreReadClient({ projectId, auth }),
    };
  }

  if (input.requireWif) {
    throw new WifNativeFirestoreReadError(
      "WIF_CONFIG_INCOMPLETE: GCP_WORKLOAD_IDENTITY_PROVIDER + GCP_SERVICE_ACCOUNT_EMAIL required for Production reads",
      "WIF_CONFIG_INCOMPLETE",
    );
  }

  // Local / traditional ADC path (no metadata server on Vercel → ADC_MISSING).
  try {
    const creds =
      await new ApplicationDefaultProductionCredentialProvider(
        projectId,
      ).getCredentials();
    if (creds.kind !== "application_default") {
      throw new WifNativeFirestoreReadError(
        "Only application_default or Vercel OIDC WIF credentials allowed",
        "WIF_CREDENTIALS_INVALID",
      );
    }
  } catch (err) {
    if (err instanceof WifNativeFirestoreReadError) throw err;
    const msg = err instanceof Error ? err.message : "credentials failed";
    throw new WifNativeFirestoreReadError(
      msg,
      /GOOGLE_APPLICATION_CREDENTIALS/i.test(msg)
        ? "WIF_CREDENTIALS_INVALID"
        : "WIF_ADC_MISSING",
    );
  }

  const transport = new Fr7WifNativeFirestoreReadTransport({ projectId });
  return {
    kind: "application_default",
    transport,
    client: new WifNativeFirestoreReadClient({ projectId }),
  };
}
