/**
 * WIF Storage upload/delete for geography images — ops_writer principal.
 * Never uses shadow-reader. Never SA JSON / ADC.
 */

import {
  createVercelOidcWifFirebaseCredential,
  type FirebaseAdminAccessTokenCredential,
} from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import {
  PRODUCTION_PROJECT_ID,
  resolveWritePrincipal,
} from "@/infrastructure/production/writes/ProductionWritePrincipals";

export class GeographyImageStorageError extends Error {
  constructor(
    readonly code:
      | "STORAGE_UNAVAILABLE"
      | "VALIDATION_FAILED"
      | "NOT_FOUND"
      | "WRITE_RUNTIME_UNAVAILABLE",
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "GeographyImageStorageError";
  }
}

export type GeographyImageObjectStore = {
  upload(input: {
    path: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<void>;
  delete(path: string): Promise<void>;
};

export class WifGeographyImageObjectStore implements GeographyImageObjectStore {
  private readonly credential: FirebaseAdminAccessTokenCredential;
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly bucket: string,
    deps?: {
      env?: NodeJS.ProcessEnv;
      credential?: FirebaseAdminAccessTokenCredential;
      fetcher?: typeof fetch;
    },
  ) {
    const env = deps?.env ?? process.env;
    if (!this.bucket.trim()) {
      throw new GeographyImageStorageError(
        "WRITE_RUNTIME_UNAVAILABLE",
        503,
        "STORAGE_BUCKET_MISSING",
      );
    }
    if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      throw new GeographyImageStorageError(
        "WRITE_RUNTIME_UNAVAILABLE",
        503,
        "SA_JSON_FORBIDDEN",
      );
    }
    const resolved = resolveWritePrincipal("ops_writer", env);
    if (!resolved.ready) {
      throw new GeographyImageStorageError(
        "WRITE_RUNTIME_UNAVAILABLE",
        503,
        resolved.reason ?? "WRITE_SA_UNAVAILABLE",
      );
    }
    const provider = env.GCP_WORKLOAD_IDENTITY_PROVIDER?.trim();
    if (!provider) {
      throw new GeographyImageStorageError(
        "WRITE_RUNTIME_UNAVAILABLE",
        503,
        "WIF_PROVIDER_MISSING",
      );
    }
    if (
      env.EXPECTED_PROJECT_ID &&
      env.EXPECTED_PROJECT_ID !== PRODUCTION_PROJECT_ID
    ) {
      throw new GeographyImageStorageError(
        "WRITE_RUNTIME_UNAVAILABLE",
        503,
        "PROJECT_MISMATCH",
      );
    }
    this.credential =
      deps?.credential ??
      createVercelOidcWifFirebaseCredential({
        workloadIdentityProvider: provider,
        serviceAccountEmail: resolved.email,
      });
    this.fetcher = deps?.fetcher ?? fetch;
  }

  private async authHeader(): Promise<string> {
    const token = await this.credential.getAccessToken();
    if (!token.access_token) {
      throw new GeographyImageStorageError("STORAGE_UNAVAILABLE", 503);
    }
    return `Bearer ${token.access_token}`;
  }

  async upload(input: {
    path: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<void> {
    if (
      !input.path ||
      input.path.includes("..") ||
      input.path.startsWith("/") ||
      input.bytes.byteLength <= 0
    ) {
      throw new GeographyImageStorageError("VALIDATION_FAILED", 400);
    }
    const auth = await this.authHeader();
    const url =
      `https://storage.googleapis.com/upload/storage/v1/b/` +
      `${encodeURIComponent(this.bucket)}/o` +
      `?uploadType=media&name=${encodeURIComponent(input.path)}`;
    const res = await this.fetcher(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": input.contentType,
      },
      body: input.bytes as BodyInit,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      throw new GeographyImageStorageError(
        "STORAGE_UNAVAILABLE",
        503,
        `UPLOAD_${res.status}`,
      );
    }
  }

  async delete(path: string): Promise<void> {
    if (!path || path.includes("..") || path.startsWith("/")) {
      throw new GeographyImageStorageError("VALIDATION_FAILED", 400);
    }
    const auth = await this.authHeader();
    const url =
      `https://storage.googleapis.com/storage/v1/b/` +
      `${encodeURIComponent(this.bucket)}/o/` +
      `${encodeURIComponent(path)}`;
    const res = await this.fetcher(url, {
      method: "DELETE",
      headers: { Authorization: auth },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    // Missing object is fine on archive.
    if (res.status === 404) return;
    if (!res.ok) {
      throw new GeographyImageStorageError(
        "STORAGE_UNAVAILABLE",
        503,
        `DELETE_${res.status}`,
      );
    }
  }
}
