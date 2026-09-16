/**
 * Phase 4A-1 — Production verified-token Auth Client wiring.
 * Bearer Firebase ID token → FirebaseAdminProductionIdentityVerifier → MappedAuthIdentity.
 * Never trusts x-user-id / x-role / x-country / x-agent.
 *
 * Auth-only path: Firebase Admin verifyIdToken via explicit EXPECTED_PROJECT_ID.
 * Decoupled from Application Default Credentials (ADC) used by Firestore Production read.
 *
 * Phase 5G: failure reasons are classified to operator-stable codes
 * (TOKEN_* / ACTOR_RESOLUTION_FAILED / AUTH_TIMEOUT) — never collapse all to invalid_token.
 */

import { verifyCurrentPanelPersona } from "@/infrastructure/auth/verifyCurrentPanelPersona";
import { getEnv, type AppEnvConfig } from "@/config/env";
import {
  resolveActorFromVerifiedToken,
  type MappedAuthIdentity,
} from "@/domain/auth/ProductionAuthDesign";
import type {
  ProductionIdentityVerifier,
  VerifiedIdentity,
} from "@/domain/auth/ProductionIdentityVerifier";
import {
  classifyIdentityVerificationFailure,
  classifyProductionAuthThrownError,
  type ProductionAuthFailureCode,
} from "@/infrastructure/auth/productionAuthFailureClassification";
import { MissingProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { FirebaseAdminFactory } from "@/infrastructure/production/firebase/FirebaseAdminFactory";
import { FirebaseAdminProductionIdentityVerifier } from "@/infrastructure/production/firebase/FirebaseAdminProductionIdentityVerifier";
import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";

let verifierOverride: ProductionIdentityVerifier | null = null;
let factorySingleton: FirebaseAdminFactory | null = null;

/** Test injection — never use in production runtime. */
export function setProductionIdentityVerifierForTests(
  verifier: ProductionIdentityVerifier | null,
): void {
  verifierOverride = verifier;
}

export function resetProductionAuthSingletonsForTests(): void {
  verifierOverride = null;
  factorySingleton = null;
  FirebaseAdminFactory.resetSingletonForTests();
}

export function extractBearerIdToken(
  authorizationHeader: string | null,
): string | null {
  if (!authorizationHeader) return null;
  if (!authorizationHeader.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token || token.startsWith("mock:")) return null;
  return token;
}

function expectedIssuer(projectId: string): string {
  return `https://securetoken.google.com/${projectId}`;
}

export async function getProductionIdentityVerifier(
  env: AppEnvConfig = getEnv(),
  observability?: ProductionReadObservability,
): Promise<ProductionIdentityVerifier> {
  if (verifierOverride) return verifierOverride;

  if (env.AUTH_MODE !== "verified_token") {
    throw new Error("AUTH_MODE must be verified_token for Production Auth Client");
  }
  if (!env.EXPECTED_PROJECT_ID?.trim()) {
    throw new Error("EXPECTED_PROJECT_ID required for Production Auth Client");
  }

  if (!factorySingleton) {
    // Auth verify must not depend on ADC. MissingProductionCredentialProvider
    // keeps Firestore Production-read init fail-closed if accidentally reached;
    // getAuthClient() uses the auth-only Admin app (projectId + stub credential).
    factorySingleton = FirebaseAdminFactory.getOrCreate({
      env: {
        APP_ENV: env.APP_ENV,
        AUTH_MODE: env.AUTH_MODE,
        PRODUCTION_READ_ENABLED: env.PRODUCTION_READ_ENABLED,
        PRODUCTION_READ_MODE: env.PRODUCTION_READ_MODE,
        PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
        GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
        FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
        DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
        AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
        EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
        EXPECTED_ENVIRONMENT: env.EXPECTED_ENVIRONMENT,
      },
      credentialProvider: new MissingProductionCredentialProvider(),
      observability,
    });
  }

  const authClient = await factorySingleton.getAuthClient();
  return new FirebaseAdminProductionIdentityVerifier({
    authClient,
    config: {
      expectedIssuer: expectedIssuer(env.EXPECTED_PROJECT_ID),
      expectedAudience: env.EXPECTED_PROJECT_ID,
      clockSkewSeconds: 60,
    },
    // Auth REST revocation/disabled verification uses the existing read-only WIF identity.
    checkRevoked: true,
    checkDisabledViaGetUser: false,
  });
}

export type ProductionVerifiedActorResult =
  | {
      ok: true;
      identity: MappedAuthIdentity;
      verified: VerifiedIdentity;
    }
  | {
      ok: false;
      /** Operator-stable code (Phase 5G+). */
      reason: ProductionAuthFailureCode;
      /** Underlying verifier/mapping reason when available (never a token). */
      detail?: string;
    };

export type ResolveProductionVerifiedActorOptions = {
  /** Optional network-boundary timeout (ms). On exceed → AUTH_TIMEOUT. */
  timeoutMs?: number;
};

async function withAuthTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`AUTH_TIMEOUT_${timeoutMs}MS`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Resolve actor from a raw Firebase ID token via Admin Next verified-token path.
 * FIREBASE_ID_TOKEN → Firebase Admin verifyIdToken (auth-only app, no ADC) →
 * project/aud validation → mapClaims → RBAC.
 * No second JWT decoder-as-auth. No unsigned / header-trust bypass.
 */
export async function resolveProductionVerifiedActor(
  idToken: string,
  env: AppEnvConfig = getEnv(),
  observability?: ProductionReadObservability,
  options: ResolveProductionVerifiedActorOptions = {},
): Promise<ProductionVerifiedActorResult> {
  if (!idToken?.trim()) {
    return { ok: false, reason: "TOKEN_MISSING", detail: "missing_token" };
  }

  const run = async (): Promise<ProductionVerifiedActorResult> => {
    try {
      const verifier = await getProductionIdentityVerifier(env, observability);
      const resolved = await resolveActorFromVerifiedToken(verifier, idToken);
      if (!resolved.ok) {
        return {
          ok: false,
          reason: classifyIdentityVerificationFailure(resolved.reason),
          detail: resolved.reason,
        };
      }
      if (!verifierOverride && !(await verifyCurrentPanelPersona(resolved.identity, env.EXPECTED_PROJECT_ID))) {
        return { ok: false, reason: "ACTOR_RESOLUTION_FAILED", detail: "PERSONA_DISABLED_MISSING_OR_CLAIMS_STALE" };
      }
      return {
        ok: true,
        identity: resolved.identity,
        verified: resolved.verified,
      };
    } catch (err) {
      return {
        ok: false,
        reason: classifyProductionAuthThrownError(err),
        detail: safeAuthExceptionDetail(err),
      };
    }
  };

  if (options.timeoutMs != null && options.timeoutMs > 0) {
    try {
      return await withAuthTimeout(run(), options.timeoutMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("AUTH_TIMEOUT_") || /timeout/i.test(msg)) {
        return { ok: false, reason: "AUTH_TIMEOUT", detail: "AUTH_TIMEOUT" };
      }
      return {
        ok: false,
        reason: classifyProductionAuthThrownError(err),
        detail: safeAuthExceptionDetail(err),
      };
    }
  }

  return run();
}

/** Redact secrets from thrown Auth errors — never log raw tokens / keys. */
function safeAuthExceptionDetail(err: unknown): string {
  if (!(err instanceof Error)) return "auth_exception";
  return err.message
    .slice(0, 160)
    .replace(/eyJ[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/BEGIN PRIVATE[\s\S]*?END PRIVATE KEY/gi, "[REDACTED_KEY]")
    .replace(/private_key[^,}]*/gi, "private_key:[REDACTED]");
}

export function getProductionFirebaseFactoryForLive(): FirebaseAdminFactory | null {
  return factorySingleton;
}
