/**
 * Phase 4A-0 — Production credential injection boundary.
 * Never commit service-account JSON. Secrets via env/secret refs only.
 * Credential error messages must never leak secret material.
 */

export type ProductionCredentials = {
  /** Project id claimed by the credential — must match EXPECTED_PROJECT_ID. */
  projectId: string;
  /**
   * Opaque credential handle. Implementations must not stringify secrets
   * into logs or thrown Error messages.
   */
  kind: "service_account_json_path" | "application_default" | "inline_json" | "fake";
  /** Absolute path to JSON — NEVER log contents. */
  serviceAccountPath?: string;
  /** Inline JSON string — only for test fakes / secret-manager injectors. */
  serviceAccountJson?: string;
};

export class ProductionCredentialError extends Error {
  readonly code:
    | "PRODUCTION_CREDENTIALS_MISSING"
    | "PRODUCTION_CREDENTIALS_INVALID"
    | "PRODUCTION_CREDENTIALS_LEAK_GUARD";

  constructor(
    code:
      | "PRODUCTION_CREDENTIALS_MISSING"
      | "PRODUCTION_CREDENTIALS_INVALID"
      | "PRODUCTION_CREDENTIALS_LEAK_GUARD",
    message: string,
  ) {
    super(sanitizeCredentialMessage(message));
    this.name = "ProductionCredentialError";
    this.code = code;
  }
}

const SECRETISH =
  /private_key|BEGIN PRIVATE KEY|client_email|firebase-adminsdk|eyJ[A-Za-z0-9_-]{10,}/i;

export function sanitizeCredentialMessage(message: string): string {
  if (SECRETISH.test(message)) {
    return "Credential error (details redacted)";
  }
  return message.replace(/\/[^\s]+serviceAccount[^\s]*/gi, "[redacted-path]");
}

export interface ProductionCredentialProvider {
  readonly name: string;
  getCredentials(): Promise<ProductionCredentials>;
}

/**
 * Default for Phase 4A-0: no credentials available.
 * Used when Production read is disabled OR when enabled without inject.
 */
export class MissingProductionCredentialProvider
  implements ProductionCredentialProvider
{
  readonly name = "MissingProductionCredentialProvider";

  async getCredentials(): Promise<never> {
    throw new ProductionCredentialError(
      "PRODUCTION_CREDENTIALS_MISSING",
      "Production credentials are not configured for Admin Next",
    );
  }
}

/** Test-only provider — never points at a real Production project. */
export class FakeProductionCredentialProvider
  implements ProductionCredentialProvider
{
  readonly name = "FakeProductionCredentialProvider";

  constructor(
    private readonly credentials: ProductionCredentials = {
      projectId: "fake-project",
      kind: "fake",
    },
  ) {}

  async getCredentials(): Promise<ProductionCredentials> {
    return this.credentials;
  }
}

/**
 * Phase 4A-1 — Application Default Credentials only (ADC / impersonated SA).
 * Refuses classic JSON service-account key files via GOOGLE_APPLICATION_CREDENTIALS.
 * Never reads or returns private key material.
 */
export class ApplicationDefaultProductionCredentialProvider
  implements ProductionCredentialProvider
{
  readonly name = "ApplicationDefaultProductionCredentialProvider";

  constructor(private readonly projectId: string) {}

  async getCredentials(): Promise<ProductionCredentials> {
    if (!this.projectId?.trim()) {
      throw new ProductionCredentialError(
        "PRODUCTION_CREDENTIALS_INVALID",
        "EXPECTED_PROJECT_ID is required for Application Default Credentials",
      );
    }

    const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (gac) {
      // Phase 4A-1 policy: dedicated Shadow SA via ADC impersonation only.
      // A path in GOOGLE_APPLICATION_CREDENTIALS usually indicates a JSON key file.
      throw new ProductionCredentialError(
        "PRODUCTION_CREDENTIALS_INVALID",
        "GOOGLE_APPLICATION_CREDENTIALS must be unset for Phase 4A-1 ADC impersonation (no JSON service account keys)",
      );
    }

    return {
      projectId: this.projectId.trim(),
      kind: "application_default",
    };
  }
}

/**
 * Assert actual Firebase project id matches EXPECTED_PROJECT_ID.
 */
export function assertExpectedFirebaseProject(
  expectedProjectId: string,
  actualProjectId: string | null | undefined,
): void {
  if (!expectedProjectId?.trim()) {
    throw new ProductionCredentialError(
      "PRODUCTION_CREDENTIALS_INVALID",
      "EXPECTED_PROJECT_ID is required",
    );
  }
  if (!actualProjectId || actualProjectId !== expectedProjectId) {
    throw new ProjectFingerprintMismatchError(
      expectedProjectId,
      actualProjectId ?? null,
    );
  }
}

export class ProjectFingerprintMismatchError extends Error {
  readonly code = "PROJECT_FINGERPRINT_MISMATCH";
  constructor(
    readonly expectedProjectId: string,
    readonly actualProjectId: string | null,
  ) {
    super(
      `PROJECT_FINGERPRINT_MISMATCH: expected=${expectedProjectId} actual=${actualProjectId ?? "null"}`,
    );
    this.name = "ProjectFingerprintMismatchError";
  }
}
