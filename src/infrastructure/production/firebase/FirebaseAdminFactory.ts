/**
 * Phase 4A-0 — Lazy Firebase Admin factory.
 * Fail-closed: PRODUCTION_READ_ENABLED=false → PRODUCTION_READ_DISABLED
 * BEFORE any credential load or SDK connection attempt.
 *
 * Multi-gate ALL required else DENY.
 * No silent Mock fallback when credentials missing with read enabled.
 */

import {
  evaluateProductionReadGate,
  ProductionReadDisabledError,
} from "@/infrastructure/production/ProductionReadGate";
import {
  assertExpectedFirebaseProject,
  MissingProductionCredentialProvider,
  ProductionCredentialError,
  type ProductionCredentialProvider,
} from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import type {
  FirebaseAdminAppHandle,
  FirebaseAuthAdminClient,
  FirebaseProductionContextConfig,
} from "@/infrastructure/production/firebase/FirebaseProductionContext";

import { resolveVercelOidcWifConfig, createVercelOidcWifFirebaseCredential } from "@/infrastructure/production/credentials/VercelOidcWifCredential";

export class FirebaseAdminInitError extends Error {
  readonly code:
    | "PRODUCTION_READ_DISABLED"
    | "PRODUCTION_READ_GATE_DENIED"
    | "PRODUCTION_CREDENTIALS_MISSING"
    | "PRODUCTION_CREDENTIALS_INVALID"
    | "PROJECT_FINGERPRINT_MISMATCH"
    | "FIREBASE_ADMIN_INIT_FAILED"
    | "AUTH_VERIFIER_INIT_FAILED";

  constructor(
    code: FirebaseAdminInitError["code"],
    message: string,
  ) {
    super(message);
    this.name = "FirebaseAdminInitError";
    this.code = code;
  }
}

/** Named Admin app used only for ID-token cryptographic verification. */
export const AUTH_ONLY_FIREBASE_APP_NAME = "admin-next-auth-verify";

/**
 * Credential stub for auth-only verifyIdToken.
 * Firebase Admin requires a Credential object at init; verifyIdToken(false)
 * uses Google public certs + explicit projectId and never calls getAccessToken.
 * Refusing ADC here keeps Vercel (no ADC) from failing at Auth verify.
 */
export const AUTH_ONLY_NO_ADC_CREDENTIAL = {
  async getAccessToken(): Promise<never> {
    throw new Error(
      "AUTH_VERIFIER_NO_ADC: auth-only Firebase Admin app refuses Application Default Credentials",
    );
  },
};

export type FirebaseAdminFactoryOptions = FirebaseProductionContextConfig & {
  /** Injected Auth client for tests — never hits Production. */
  authClient?: FirebaseAuthAdminClient;
  /** Injected app handle for tests. */
  appHandle?: FirebaseAdminAppHandle;
};

let singleton: FirebaseAdminFactory | null = null;

/**
 * Factory is intentionally NOT auto-created at module load.
 */
export class FirebaseAdminFactory {
  private app: FirebaseAdminAppHandle | null = null;
  private authOnlyApp: FirebaseAdminAppHandle | null = null;
  private authClient: FirebaseAuthAdminClient | null = null;
  private initAttempted = false;
  private authOnlyInitAttempted = false;

  constructor(private readonly options: FirebaseAdminFactoryOptions) {}

  static resetSingletonForTests(): void {
    singleton = null;
  }

  static getOrCreate(options: FirebaseAdminFactoryOptions): FirebaseAdminFactory {
    if (!singleton) {
      singleton = new FirebaseAdminFactory(options);
    }
    return singleton;
  }

  /** Write flags must stay false for any Production Firebase touch. */
  private assertWriteFlagsDisabled(): void {
    const env = this.options.env;
    const writeFlags: Array<[string, boolean]> = [
      ["PRODUCTION_WRITE_ENABLED", env.PRODUCTION_WRITE_ENABLED],
      ["GLOBAL_PRODUCTION_WRITE_ENABLED", env.GLOBAL_PRODUCTION_WRITE_ENABLED],
      ["FINANCE_WRITE_ENABLED", env.FINANCE_WRITE_ENABLED],
      ["DRIVER_WRITE_ENABLED", env.DRIVER_WRITE_ENABLED],
      ["AGENT_WRITE_ENABLED", env.AGENT_WRITE_ENABLED],
    ];
    for (const [name, enabled] of writeFlags) {
      if (enabled) {
        this.options.observability?.emit({
          type: "production_read_denied",
          reason: `${name}=true`,
          code: "WRITE_FLAG_DENY",
        });
        throw new FirebaseAdminInitError(
          "PRODUCTION_READ_GATE_DENIED",
          `WRITE_FLAG_DENY: ${name} must be false`,
        );
      }
    }
  }

  /**
   * Auth-only gates: verified_token + project id + no write flags.
   * Does NOT require PRODUCTION_READ_ENABLED (Auth verify ≠ Firestore read).
   */
  private assertAuthGatesAllowInit(): void {
    const env = this.options.env;
    this.assertWriteFlagsDisabled();
    if (env.AUTH_MODE !== "verified_token") {
      throw new FirebaseAdminInitError(
        "PRODUCTION_READ_GATE_DENIED",
        "AUTH_MODE_DENIED: AUTH_MODE must be verified_token",
      );
    }
    if (!env.EXPECTED_PROJECT_ID?.trim()) {
      throw new FirebaseAdminInitError(
        "PRODUCTION_READ_GATE_DENIED",
        "PROJECT_FINGERPRINT_MISMATCH: EXPECTED_PROJECT_ID required",
      );
    }
  }

  /**
   * Dynamic kill switch — checked on every getApp() call (not only startup).
   */
  private assertGatesAllowInit(): void {
    const env = this.options.env;
    if (!env.PRODUCTION_READ_ENABLED) {
      this.options.observability?.emit({
        type: "kill_switch_triggered",
        flag: "PRODUCTION_READ_ENABLED",
      });
      throw new FirebaseAdminInitError(
        "PRODUCTION_READ_DISABLED",
        "PRODUCTION_READ_DISABLED: Production Firebase init denied",
      );
    }

    const gate = evaluateProductionReadGate({
      PRODUCTION_READ_ENABLED: env.PRODUCTION_READ_ENABLED,
      PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
      GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
      DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
      AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
      APP_ENV: env.APP_ENV,
      AUTH_MODE: env.AUTH_MODE,
      PRODUCTION_READ_MODE: env.PRODUCTION_READ_MODE,
      expectedProjectId: env.EXPECTED_PROJECT_ID,
      actualProjectId:
        this.options.actualProjectIdOverride ?? env.EXPECTED_PROJECT_ID,
    });

    if (!gate.allow) {
      this.options.observability?.emit({
        type: "production_read_denied",
        reason: gate.reason,
        code: gate.code,
      });
      throw new FirebaseAdminInitError(
        "PRODUCTION_READ_GATE_DENIED",
        `${gate.code}: ${gate.reason}`,
      );
    }
  }

  /**
   * Shared app init after gates. Fingerprint must match before return.
   */
  private async ensureAppInitialized(): Promise<FirebaseAdminAppHandle> {
    if (this.options.appHandle) {
      assertExpectedFirebaseProject(
        this.options.env.EXPECTED_PROJECT_ID,
        this.options.appHandle.projectId,
      );
      this.app = this.options.appHandle;
      return this.app;
    }

    if (this.app) return this.app;

    if (this.initAttempted) {
      throw new FirebaseAdminInitError(
        "FIREBASE_ADMIN_INIT_FAILED",
        "Previous Firebase Admin init failed — no retry without reset",
      );
    }
    this.initAttempted = true;

    const credentials = await this.loadCredentialsOrFail();
    assertExpectedFirebaseProject(
      this.options.env.EXPECTED_PROJECT_ID,
      credentials.projectId,
    );

    // Dynamic import only after gates + credentials succeed.
    // Phase 4A-0: real SDK init path exists but is NOT activatable without
    // credentials + flags. Tests inject appHandle / authClient instead.
    if (credentials.kind === "fake") {
      this.app = {
        projectId: credentials.projectId,
        appName: "admin-next-fake",
      };
      return this.app;
    }

    try {
      const admin = await import("firebase-admin");
      const existing = admin.apps.find((a) => a?.name === "admin-next-production-read");
      if (existing) {
        const projectId =
          existing.options.projectId ?? credentials.projectId;
        assertExpectedFirebaseProject(
          this.options.env.EXPECTED_PROJECT_ID,
          projectId,
        );
        this.app = {
          projectId,
          appName: existing.name,
        };
        return this.app;
      }

      const credential =
        credentials.kind === "service_account_json_path" &&
        credentials.serviceAccountPath
          ? admin.credential.cert(credentials.serviceAccountPath)
          : credentials.kind === "inline_json" && credentials.serviceAccountJson
            ? admin.credential.cert(JSON.parse(credentials.serviceAccountJson))
            : admin.credential.applicationDefault();

      const app = admin.initializeApp(
        {
          credential,
          projectId: credentials.projectId,
        },
        "admin-next-production-read",
      );
      const projectId = app.options.projectId ?? credentials.projectId;
      assertExpectedFirebaseProject(
        this.options.env.EXPECTED_PROJECT_ID,
        projectId,
      );
      this.app = { projectId, appName: app.name };
      return this.app;
    } catch (err) {
      if (
        err instanceof ProductionCredentialError ||
        err instanceof FirebaseAdminInitError
      ) {
        throw err;
      }
      const msg =
        err instanceof Error ? err.message : "Firebase Admin init failed";
      throw new FirebaseAdminInitError(
        "FIREBASE_ADMIN_INIT_FAILED",
        msg.includes("private_key") || msg.includes("BEGIN PRIVATE")
          ? "Firebase Admin init failed (details redacted)"
          : msg,
      );
    }
  }

  /**
   * Fail-closed entry for Firestore / Production read. Never connects when read disabled.
   */
  async getApp(): Promise<FirebaseAdminAppHandle> {
    this.assertGatesAllowInit();
    return this.ensureAppInitialized();
  }

  /**
   * Auth-only Admin app: explicit EXPECTED_PROJECT_ID, no ADC / SA JSON.
   * Used solely for verifyIdToken cryptographic checks (sig / iss / aud / exp).
   * Does NOT share the Production-read Firestore credential path.
   */
  private async ensureAuthOnlyAppInitialized(): Promise<FirebaseAdminAppHandle> {
    if (this.options.appHandle) {
      assertExpectedFirebaseProject(
        this.options.env.EXPECTED_PROJECT_ID,
        this.options.appHandle.projectId,
      );
      this.authOnlyApp = this.options.appHandle;
      return this.authOnlyApp;
    }

    if (this.authOnlyApp) return this.authOnlyApp;

    if (this.authOnlyInitAttempted) {
      throw new FirebaseAdminInitError(
        "AUTH_VERIFIER_INIT_FAILED",
        "Previous auth-only Firebase Admin init failed — no retry without reset",
      );
    }
    this.authOnlyInitAttempted = true;

    const projectId = this.options.env.EXPECTED_PROJECT_ID?.trim();
    if (!projectId) {
      throw new FirebaseAdminInitError(
        "AUTH_VERIFIER_INIT_FAILED",
        "EXPECTED_PROJECT_ID required for auth-only token verification",
      );
    }

    try {
      const admin = await import("firebase-admin");
      const existing = admin.apps.find(
        (a) => a?.name === AUTH_ONLY_FIREBASE_APP_NAME,
      );
      if (existing) {
        const existingProjectId = existing.options.projectId ?? projectId;
        assertExpectedFirebaseProject(projectId, existingProjectId);
        this.authOnlyApp = {
          projectId: existingProjectId,
          appName: existing.name,
        };
        return this.authOnlyApp;
      }

      const wif = resolveVercelOidcWifConfig();
      if (wif.status !== "ready" || !wif.config || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        throw new FirebaseAdminInitError("PRODUCTION_CREDENTIALS_INVALID", "Verified runtime authentication requires WIF; ADC and service-account keys are forbidden");
      }
      const app = admin.initializeApp(
        {
          credential: createVercelOidcWifFirebaseCredential(wif.config),
          projectId,
        },
        AUTH_ONLY_FIREBASE_APP_NAME,
      );
      const initializedProjectId = app.options.projectId ?? projectId;
      assertExpectedFirebaseProject(projectId, initializedProjectId);
      this.authOnlyApp = {
        projectId: initializedProjectId,
        appName: app.name,
      };
      return this.authOnlyApp;
    } catch (err) {
      if (
        err instanceof ProductionCredentialError ||
        err instanceof FirebaseAdminInitError
      ) {
        throw err;
      }
      const msg =
        err instanceof Error ? err.message : "Auth-only Firebase Admin init failed";
      throw new FirebaseAdminInitError(
        "AUTH_VERIFIER_INIT_FAILED",
        msg.includes("private_key") || msg.includes("BEGIN PRIVATE")
          ? "Auth-only Firebase Admin init failed (details redacted)"
          : msg.slice(0, 200),
      );
    }
  }

  /**
   * Auth Admin client for verified-token path.
   * Decoupled from ADC / Production-read credentials.
   * Does not require PRODUCTION_READ_ENABLED; still refuses write flags / mock auth.
   * Signature verification plus revocation/disabled checks through the read-only WIF Auth credential.
   */
  async getAuthClient(): Promise<FirebaseAuthAdminClient> {
    this.assertAuthGatesAllowInit();
    if (this.options.authClient) {
      this.authClient = this.options.authClient;
      return this.authClient;
    }
    if (this.authClient) return this.authClient;

    const appHandle = await this.ensureAuthOnlyAppInitialized();
    const admin = await import("firebase-admin");
    const app =
      admin.apps.find((a) => a?.name === appHandle.appName) ??
      admin.app(appHandle.appName);
    const auth = admin.auth(app);
    this.authClient = {
      async verifyIdToken(token: string, checkRevoked?: boolean) {
        // Google public certificate validation, then Auth read via WIF for revocation/disabled status.
        const decoded = await auth.verifyIdToken(token, checkRevoked === true);
        return decoded as unknown as import("./FirebaseProductionContext").DecodedIdTokenClaims;
      },
      async getUser(uid: string) {
        const user = await auth.getUser(uid);
        return { disabled: user.disabled, emailVerified: user.emailVerified };
      },
    };
    return this.authClient;
  }

  private async loadCredentialsOrFail() {
    const provider: ProductionCredentialProvider =
      this.options.credentialProvider ??
      new MissingProductionCredentialProvider();
    try {
      return await provider.getCredentials();
    } catch (err) {
      if (err instanceof ProductionCredentialError) {
        throw new FirebaseAdminInitError(
          err.code === "PRODUCTION_CREDENTIALS_MISSING"
            ? "PRODUCTION_CREDENTIALS_MISSING"
            : "PRODUCTION_CREDENTIALS_INVALID",
          err.message,
        );
      }
      throw err;
    }
  }
}

/**
 * Startup assert used when PRODUCTION_READ_ENABLED=true:
 * missing credentials → fail startup (no Mock fallback).
 */
export async function assertProductionReadStartupOrThrow(input: {
  PRODUCTION_READ_ENABLED: boolean;
  credentialProvider: ProductionCredentialProvider;
}): Promise<void> {
  if (!input.PRODUCTION_READ_ENABLED) {
    return;
  }
  try {
    await input.credentialProvider.getCredentials();
  } catch (err) {
    if (err instanceof ProductionCredentialError) {
      throw err;
    }
    throw new ProductionCredentialError(
      "PRODUCTION_CREDENTIALS_MISSING",
      "Production read enabled but credentials unavailable",
    );
  }
}

export function mapProductionReadDisabled(
  err: unknown,
): ProductionReadDisabledError | null {
  if (
    err instanceof FirebaseAdminInitError &&
    err.code === "PRODUCTION_READ_DISABLED"
  ) {
    return new ProductionReadDisabledError(err.message);
  }
  return null;
}
