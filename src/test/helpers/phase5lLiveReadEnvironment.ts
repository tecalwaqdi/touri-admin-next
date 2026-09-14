/**
 * Phase 5L — live Production read environment (plan-only dry-run).
 *
 * Must run inside `it()` AFTER Vitest global `beforeEach` (src/test/setup.ts),
 * which otherwise clears EXPECTED_PROJECT_ID / APP_ENV / Production Read flags.
 *
 * - Sets minimal LIVE_SHADOW_ALLOWED_RESOURCES=drivers (Phase 5L contract)
 * - All write flags false (incl. SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED)
 * - Deletes GOOGLE_APPLICATION_CREDENTIALS (ADC only; no SA JSON)
 * - Never clears FIREBASE_ID_TOKEN
 * - Call loadEnv() AFTER this (reads process.env — no disconnected partial copy)
 */

import { resetEnvCache } from "@/config/env";
import {
  PHASE_5L_EXPECTED_PROJECT_ID,
  PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES,
} from "@/application/controlled-writes/pilot/Phase5LLiveReadContract";
import { resetProductionAuthSingletonsForTests } from "@/infrastructure/auth/productionVerifiedAuth";
import type { OperatorHarnessEnvMap } from "@/test/helpers/operatorHarnessEnvPreservation";

export type ApplyPhase5LLiveReadEnvironmentInput = {
  /** Absolute or repo-relative path for file_ndjson observability. */
  readonly observabilityFilePath: string;
  readonly env?: OperatorHarnessEnvMap;
};

/**
 * Construct a valid Phase 5L live-read process.env before loadEnv().
 * Preserves FIREBASE_ID_TOKEN if present.
 */
export function applyPhase5LLiveReadEnvironment(
  input: ApplyPhase5LLiveReadEnvironmentInput,
): void {
  const env = input.env ?? process.env;

  // Capture token so accidental clears cannot drop it during mutation.
  const token = env.FIREBASE_ID_TOKEN;

  env.APP_ENV = "production";
  env.NEXT_PUBLIC_APP_ENV = "production";
  env.AUTH_MODE = "verified_token";
  env.EXPECTED_PROJECT_ID = PHASE_5L_EXPECTED_PROJECT_ID;
  env.GOOGLE_CLOUD_PROJECT = PHASE_5L_EXPECTED_PROJECT_ID;
  env.EXPECTED_ENVIRONMENT = "production";
  env.PRODUCTION_READ_MODE = "shadow";
  env.PRODUCTION_READ_ENABLED = "true";
  env.LIVE_SHADOW_ALLOWED_RESOURCES = PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES;
  env.FULL_PII_SHADOW_ENABLED = "false";

  env.PRODUCTION_WRITE_ENABLED = "false";
  env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  env.FINANCE_WRITE_ENABLED = "false";
  env.DRIVER_WRITE_ENABLED = "false";
  env.AGENT_WRITE_ENABLED = "false";
  env.CUSTOMER_WRITE_ENABLED = "false";
  env.CUSTOMER_AUTH_WRITE_ENABLED = "false";
  env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED = "false";
  env.PHASE5I_PROVISION_SYNTHETIC_DRIVER = "";

  env.PRODUCTION_READ_OBSERVABILITY_SINK = "file_ndjson";
  env.PRODUCTION_READ_OBSERVABILITY_FILE = input.observabilityFilePath;

  delete env.GOOGLE_APPLICATION_CREDENTIALS;

  if (token !== undefined) {
    env.FIREBASE_ID_TOKEN = token;
  }

  resetEnvCache();
  resetProductionAuthSingletonsForTests();
}
