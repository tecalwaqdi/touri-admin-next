/**
 * Phase 4A-0 — Production Firebase context (lazy, gated).
 * UI MUST NOT import this module. Application MUST NOT import firebase-admin.
 */

import type { AppEnvConfig } from "@/config/env";
import type { ProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";

export type FirebaseProductionContextConfig = {
  env: Pick<
    AppEnvConfig,
    | "APP_ENV"
    | "AUTH_MODE"
    | "PRODUCTION_READ_ENABLED"
    | "PRODUCTION_READ_MODE"
    | "PRODUCTION_WRITE_ENABLED"
    | "GLOBAL_PRODUCTION_WRITE_ENABLED"
    | "FINANCE_WRITE_ENABLED"
    | "DRIVER_WRITE_ENABLED"
    | "AGENT_WRITE_ENABLED"
    | "EXPECTED_PROJECT_ID"
    | "EXPECTED_ENVIRONMENT"
  >;
  credentialProvider: ProductionCredentialProvider;
  observability?: ProductionReadObservability;
  /** Override for tests — do not set in production wiring. */
  actualProjectIdOverride?: string | null;
};

export type FirebaseAdminAppHandle = {
  readonly projectId: string;
  readonly appName: string;
};

/**
 * Opaque Auth Admin surface used by identity verifier.
 * Real Firebase Admin Auth is adapted behind this — never leak SDK types to domain.
 */
export type DecodedIdTokenClaims = {
  uid: string;
  email?: string | null;
  email_verified?: boolean;
  disabled?: boolean;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  auth_time?: number;
  [claim: string]: unknown;
};

export interface FirebaseAuthAdminClient {
  verifyIdToken(token: string, checkRevoked?: boolean): Promise<DecodedIdTokenClaims>;
  getUser?(uid: string): Promise<{ disabled: boolean; emailVerified: boolean }>;
}
