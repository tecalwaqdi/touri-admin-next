/**
 * Phase 5M — scoped live operator env (Production WRITE contract).
 *
 * Global Vitest beforeEach resets APP_ENV / EXPECTED_ENVIRONMENT to development
 * and clears write flags. Only the Phase 5M live harness restores a full
 * production write environment when PHASE5M_DRIVER_PILOT_APPLY=1.
 *
 * Global env safety is unchanged: PRODUCTION_READ_MODE=shadow forbids write
 * flags, so this helper uses PRODUCTION_READ_ENABLED=false /
 * PRODUCTION_READ_MODE=disabled for loadEnv, while asserting
 * LIVE_SHADOW_ALLOWED_RESOURCES=drivers (Phase 5L minimum resource scope).
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
import { PHASE_5M_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/isPhase5MDriverPilotApplyEnabled";
import type { Phase5MOperatorGateEnv } from "@/application/controlled-writes/pilot/Phase5MOperatorGates";
import type { OperatorHarnessEnvMap } from "@/test/helpers/operatorHarnessEnvPreservation";

export const PHASE_5M_OPERATOR_LIVE_GATE_KEYS = [
  "PHASE5M_DRIVER_PILOT_APPLY",
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
  "CUSTOMER_AUTH_WRITE_ENABLED",
  "FINANCE_WRITE_ENABLED",
  "SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED",
  "EXPECTED_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT",
  "FIREBASE_ID_TOKEN",
] as const;

export type Phase5MOperatorLiveGateKey =
  (typeof PHASE_5M_OPERATOR_LIVE_GATE_KEYS)[number];

export type Phase5MOperatorLiveGateCapture = {
  readonly [K in Phase5MOperatorLiveGateKey]?: string;
};

export function capturePhase5MOperatorLiveGates(
  env: OperatorHarnessEnvMap = process.env,
): Phase5MOperatorLiveGateCapture {
  const out: Record<string, string> = {};
  for (const key of PHASE_5M_OPERATOR_LIVE_GATE_KEYS) {
    const v = env[key];
    if (v !== undefined && v !== "") out[key] = v;
  }
  return out as Phase5MOperatorLiveGateCapture;
}

/**
 * Re-apply captured operator write gates only (legacy). Prefer
 * applyPhase5MLiveProductionWriteEnvironment for the armed loadEnv path.
 */
export function applyPhase5MOperatorLiveEnvironment(
  captured: Phase5MOperatorLiveGateCapture,
  env: OperatorHarnessEnvMap = process.env,
): void {
  for (const key of PHASE_5M_OPERATOR_LIVE_GATE_KEYS) {
    const value = captured[key];
    if (value === undefined) continue;
    env[key] = value;
  }
  if (env.AGENT_WRITE_ENABLED === undefined) env.AGENT_WRITE_ENABLED = "false";
  if (env.CUSTOMER_WRITE_ENABLED === undefined)
    env.CUSTOMER_WRITE_ENABLED = "false";
  if (env.CUSTOMER_AUTH_WRITE_ENABLED === undefined)
    env.CUSTOMER_AUTH_WRITE_ENABLED = "false";
  if (env.FINANCE_WRITE_ENABLED === undefined)
    env.FINANCE_WRITE_ENABLED = "false";
  if (env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED === undefined)
    env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED = "false";
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
}

export type ApplyPhase5MLiveProductionWriteEnvironmentInput = {
  /** Operator write gates captured at module load (before beforeEach wipe). */
  readonly capturedGates: Phase5MOperatorLiveGateCapture;
  readonly env?: OperatorHarnessEnvMap;
};

/**
 * Construct a valid Phase 5M live Production WRITE process.env BEFORE loadEnv().
 * Call ONLY from phase5m-driver-pilot-apply.test.ts when armed.
 *
 * Preserves FIREBASE_ID_TOKEN. ADC only (deletes GOOGLE_APPLICATION_CREDENTIALS).
 * Does not weaken global env.ts / LiveShadowStartupGuard.
 */
export function applyPhase5MLiveProductionWriteEnvironment(
  input: ApplyPhase5MLiveProductionWriteEnvironmentInput,
): void {
  const env = input.env ?? process.env;

  // Capture token so accidental clears cannot drop it during mutation.
  const token = env.FIREBASE_ID_TOKEN;

  // 1) Restore operator write gates wiped by Vitest beforeEach.
  applyPhase5MOperatorLiveEnvironment(input.capturedGates, env);

  // 2) Production identity — Vitest beforeEach forces development; that caused
  //    the first apply loadEnv() failure with write flags true.
  Object.assign(env, { NODE_ENV: "production" });
  env.APP_ENV = "production";
  env.NEXT_PUBLIC_APP_ENV = "production";
  env.EXPECTED_ENVIRONMENT = "production";
  env.AUTH_MODE = "verified_token";

  // 3) Project fingerprint (operator capture may already set these).
  env.EXPECTED_PROJECT_ID =
    env.EXPECTED_PROJECT_ID?.trim() || PHASE_5M_EXPECTED_PROJECT_ID;
  env.GOOGLE_CLOUD_PROJECT =
    env.GOOGLE_CLOUD_PROJECT?.trim() || PHASE_5M_EXPECTED_PROJECT_ID;

  // 4) Required write gates (fail-closed later via evaluatePhase5MOperatorGates).
  env.PHASE5M_DRIVER_PILOT_APPLY =
    env.PHASE5M_DRIVER_PILOT_APPLY?.trim() || "1";
  env.GLOBAL_PRODUCTION_WRITE_ENABLED = "true";
  env.PRODUCTION_WRITE_ENABLED = "true";
  env.DRIVER_WRITE_ENABLED = "true";
  env.AGENT_WRITE_ENABLED = "false";
  env.CUSTOMER_WRITE_ENABLED = "false";
  env.CUSTOMER_AUTH_WRITE_ENABLED = "false";
  env.FINANCE_WRITE_ENABLED = "false";
  env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED = "false";

  // 5) Resource-scope fingerprint (Phase 5L minimum). Global safety forbids
  //    PRODUCTION_READ_MODE=shadow with write flags true — keep read disabled
  //    for loadEnv; assert drivers-only separately.
  env.LIVE_SHADOW_ALLOWED_RESOURCES = PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES;
  env.PRODUCTION_READ_ENABLED = String(
    PHASE_5M_LIVE_WRITE_CONTRACT.productionReadEnabled,
  );
  env.PRODUCTION_READ_MODE = PHASE_5M_LIVE_WRITE_CONTRACT.productionReadMode;
  env.FULL_PII_SHADOW_ENABLED = "false";

  delete env.GOOGLE_APPLICATION_CREDENTIALS;

  if (token !== undefined) {
    env.FIREBASE_ID_TOKEN = token;
  }

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

/**
 * loadEnv() after applyPhase5MLiveProductionWriteEnvironment — must PASS when
 * armed with valid production write gates. Reads process.env (no partial copy).
 */
export function loadPhase5MLiveProductionWriteEnv(): AppEnvConfig {
  return loadEnv();
}

/**
 * FirebaseAdminFactory Auth path refuses write flags (WRITE_FLAG_DENY).
 * Verified-actor resolution therefore uses a write-disabled view of the same
 * production env — process.env write flags remain for operator gates / apply.
 */
export function envForPhase5MVerifiedActorResolution(
  env: AppEnvConfig,
): AppEnvConfig {
  return {
    ...env,
    PRODUCTION_WRITE_ENABLED: false,
    GLOBAL_PRODUCTION_WRITE_ENABLED: false,
    DRIVER_WRITE_ENABLED: false,
    AGENT_WRITE_ENABLED: false,
    CUSTOMER_WRITE_ENABLED: false,
    FINANCE_WRITE_ENABLED: false,
  };
}

export function readPhase5MOperatorGatesFromEnv(
  env: OperatorHarnessEnvMap = process.env,
): Phase5MOperatorGateEnv {
  return {
    PHASE5M_DRIVER_PILOT_APPLY: env.PHASE5M_DRIVER_PILOT_APPLY,
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
    AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
    CUSTOMER_WRITE_ENABLED: env.CUSTOMER_WRITE_ENABLED,
    CUSTOMER_AUTH_WRITE_ENABLED: env.CUSTOMER_AUTH_WRITE_ENABLED,
    FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
    SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED:
      env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
    EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT,
  };
}

export const PHASE_5M_OPERATOR_PROJECT_FINGERPRINT = PHASE_5M_EXPECTED_PROJECT_ID;
