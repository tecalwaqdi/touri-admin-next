/**
 * Phase 5N — scoped live operator env (Production metadata WRITE contract).
 *
 * Global Vitest beforeEach resets APP_ENV / EXPECTED_ENVIRONMENT to development
 * and clears write flags. Only the Phase 5N live apply harness restores a
 * production write environment when PHASE5N_METADATA_RECONCILE_APPLY=1.
 *
 * Narrower than Phase 5M: DRIVER_WRITE_ENABLED stays false (metadata only).
 * ADC only — deletes GOOGLE_APPLICATION_CREDENTIALS.
 */

import { loadEnv, resetEnvCache, type AppEnvConfig } from "@/config/env";
import { resetProductionAuthSingletonsForTests } from "@/infrastructure/auth/productionVerifiedAuth";
import {
  assertPhase5MLiveProductionIdentity,
  assertPhase5MLiveProjectFingerprint,
  assertPhase5MLiveShadowResources,
  PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES,
  PHASE_5M_LIVE_WRITE_CONTRACT,
} from "@/application/controlled-writes/pilot/Phase5MLiveWriteContract";
import { PHASE_5N_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import type { Phase5NOperatorGateEnv } from "@/application/controlled-writes/pilot/Phase5NOperatorGates";
import type { OperatorHarnessEnvMap } from "@/test/helpers/operatorHarnessEnvPreservation";

export const PHASE_5N_OPERATOR_LIVE_GATE_KEYS = [
  "PHASE5N_METADATA_RECONCILE_APPLY",
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
  "CUSTOMER_AUTH_WRITE_ENABLED",
  "FINANCE_WRITE_ENABLED",
  "SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED",
  "PHASE5M_DRIVER_PILOT_APPLY",
  "EXPECTED_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT",
] as const;

export type Phase5NOperatorLiveGateKey =
  (typeof PHASE_5N_OPERATOR_LIVE_GATE_KEYS)[number];

export type Phase5NOperatorLiveGateCapture = {
  readonly [K in Phase5NOperatorLiveGateKey]?: string;
};

export function capturePhase5NOperatorLiveGates(
  env: OperatorHarnessEnvMap = process.env,
): Phase5NOperatorLiveGateCapture {
  const out: Record<string, string> = {};
  for (const key of PHASE_5N_OPERATOR_LIVE_GATE_KEYS) {
    const v = env[key];
    if (v !== undefined && v !== "") out[key] = v;
  }
  return out as Phase5NOperatorLiveGateCapture;
}

export function applyPhase5NOperatorLiveEnvironment(
  captured: Phase5NOperatorLiveGateCapture,
  env: OperatorHarnessEnvMap = process.env,
): void {
  for (const key of PHASE_5N_OPERATOR_LIVE_GATE_KEYS) {
    const value = captured[key];
    if (value === undefined) continue;
    env[key] = value;
  }
  // Domain and sibling surfaces must stay false for metadata-only reconcile.
  env.DRIVER_WRITE_ENABLED = "false";
  if (env.AGENT_WRITE_ENABLED === undefined) env.AGENT_WRITE_ENABLED = "false";
  if (env.CUSTOMER_WRITE_ENABLED === undefined)
    env.CUSTOMER_WRITE_ENABLED = "false";
  if (env.CUSTOMER_AUTH_WRITE_ENABLED === undefined)
    env.CUSTOMER_AUTH_WRITE_ENABLED = "false";
  if (env.FINANCE_WRITE_ENABLED === undefined)
    env.FINANCE_WRITE_ENABLED = "false";
  if (env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED === undefined)
    env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED = "false";
  env.PHASE5M_DRIVER_PILOT_APPLY = "";
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
}

export type ApplyPhase5NLiveProductionWriteEnvironmentInput = {
  readonly capturedGates: Phase5NOperatorLiveGateCapture;
  readonly env?: OperatorHarnessEnvMap;
};

/**
 * Construct a valid Phase 5N live Production metadata WRITE process.env BEFORE
 * loadEnv(). Call ONLY from phase5n-metadata-reconcile-apply.test.ts when armed.
 *
 * DRIVER_WRITE_ENABLED=false. ADC only. Does not broaden beyond metadata needs.
 */
export function applyPhase5NLiveProductionWriteEnvironment(
  input: ApplyPhase5NLiveProductionWriteEnvironmentInput,
): void {
  const env = input.env ?? process.env;

  applyPhase5NOperatorLiveEnvironment(input.capturedGates, env);

  Object.assign(env, { NODE_ENV: "production" });
  env.APP_ENV = "production";
  env.NEXT_PUBLIC_APP_ENV = "production";
  env.EXPECTED_ENVIRONMENT = "production";
  env.AUTH_MODE = "verified_token";

  env.EXPECTED_PROJECT_ID =
    env.EXPECTED_PROJECT_ID?.trim() || PHASE_5N_EXPECTED_PROJECT_ID;
  env.GOOGLE_CLOUD_PROJECT =
    env.GOOGLE_CLOUD_PROJECT?.trim() || PHASE_5N_EXPECTED_PROJECT_ID;

  env.PHASE5N_METADATA_RECONCILE_APPLY =
    env.PHASE5N_METADATA_RECONCILE_APPLY?.trim() || "1";
  env.GLOBAL_PRODUCTION_WRITE_ENABLED = "true";
  env.PRODUCTION_WRITE_ENABLED = "true";
  // Metadata-only: never arm Driver domain writes.
  env.DRIVER_WRITE_ENABLED = "false";
  env.AGENT_WRITE_ENABLED = "false";
  env.CUSTOMER_WRITE_ENABLED = "false";
  env.CUSTOMER_AUTH_WRITE_ENABLED = "false";
  env.FINANCE_WRITE_ENABLED = "false";
  env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED = "false";
  env.PHASE5M_DRIVER_PILOT_APPLY = "";

  env.LIVE_SHADOW_ALLOWED_RESOURCES = PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES;
  env.PRODUCTION_READ_ENABLED = String(
    PHASE_5M_LIVE_WRITE_CONTRACT.productionReadEnabled,
  );
  env.PRODUCTION_READ_MODE = PHASE_5M_LIVE_WRITE_CONTRACT.productionReadMode;
  env.FULL_PII_SHADOW_ENABLED = "false";

  delete env.GOOGLE_APPLICATION_CREDENTIALS;

  assertPhase5MLiveProductionIdentity({
    NODE_ENV: env.NODE_ENV,
    APP_ENV: env.APP_ENV,
    EXPECTED_ENVIRONMENT: env.EXPECTED_ENVIRONMENT,
  });
  assertPhase5MLiveProjectFingerprint({
    EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT,
  });
  assertPhase5MLiveShadowResources(env.LIVE_SHADOW_ALLOWED_RESOURCES);

  resetEnvCache();
  resetProductionAuthSingletonsForTests();
}

export function loadPhase5NLiveProductionWriteEnv(): AppEnvConfig {
  return loadEnv();
}

export function readPhase5NOperatorGatesFromEnv(
  env: OperatorHarnessEnvMap = process.env,
): Phase5NOperatorGateEnv {
  return {
    PHASE5N_METADATA_RECONCILE_APPLY: env.PHASE5N_METADATA_RECONCILE_APPLY,
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
    AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
    CUSTOMER_WRITE_ENABLED: env.CUSTOMER_WRITE_ENABLED,
    CUSTOMER_AUTH_WRITE_ENABLED: env.CUSTOMER_AUTH_WRITE_ENABLED,
    FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
    SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED:
      env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
    PHASE5M_DRIVER_PILOT_APPLY: env.PHASE5M_DRIVER_PILOT_APPLY,
    EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT,
  };
}

export const PHASE_5N_OPERATOR_PROJECT_FINGERPRINT = PHASE_5N_EXPECTED_PROJECT_ID;

/** Documented ADC user principal for operator reports (gcloud account). */
export const PHASE_5N_EXPECTED_ADC_USER_PRINCIPAL =
  "info@touri-taxi.com" as const;
