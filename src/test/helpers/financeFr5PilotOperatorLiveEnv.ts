/**
 * FR5 Settlement Execution Pilot — scoped live operator env (independent Finance write gate).
 *
 * Global Vitest beforeEach clears EXPECTED_PROJECT_ID and write flags.
 * Live harness captures operator inline env at module load and re-applies when armed.
 *
 * FINANCE_WRITE_ENABLED is independent — GLOBAL/PRODUCTION stay false.
 * Do NOT disableWriteFlags before live apply (FR1 lesson).
 */

import { loadEnv, resetEnvCache, type AppEnvConfig } from "@/config/env";
import { resetProductionAuthSingletonsForTests } from "@/infrastructure/auth/productionVerifiedAuth";
import { FINANCE_FR5_EXPECTED_PROJECT_ID } from "@/application/finance/pilot/FinanceFr5PilotConstants";
import type { FinanceFr5OperatorGateEnv } from "@/application/finance/pilot/FinanceFr5PilotGates";
import type { OperatorHarnessEnvMap } from "@/test/helpers/operatorHarnessEnvPreservation";

export const FINANCE_FR5_PILOT_OPERATOR_LIVE_GATE_KEYS = [
  "FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY",
  "FINANCE_WRITE_ENABLED",
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
  "EXPECTED_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT",
  "SOURCE",
  "FIREBASE_ID_TOKEN",
  "FINANCE_FR1_PILOT_APPLY",
  "FINANCE_FR2_SETTLEMENT_PILOT_APPLY",
  "FINANCE_FR3_RECON_PILOT_VERIFY",
  "FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY",
] as const;

export type FinanceFr5PilotOperatorLiveGateKey =
  (typeof FINANCE_FR5_PILOT_OPERATOR_LIVE_GATE_KEYS)[number];

export type FinanceFr5PilotOperatorLiveGateCapture = {
  readonly [K in FinanceFr5PilotOperatorLiveGateKey]?: string;
};

export function captureFinanceFr5PilotOperatorLiveGates(
  env: OperatorHarnessEnvMap = process.env,
): FinanceFr5PilotOperatorLiveGateCapture {
  const out: Record<string, string> = {};
  for (const key of FINANCE_FR5_PILOT_OPERATOR_LIVE_GATE_KEYS) {
    const v = env[key];
    if (v !== undefined && v !== "") out[key] = v;
  }
  return out as FinanceFr5PilotOperatorLiveGateCapture;
}

/**
 * Construct FR5 live Finance WRITE process.env BEFORE loadEnv().
 * Call ONLY from finance-fr5-settlement-execution-pilot-apply.test.ts when armed.
 */
export function applyFinanceFr5PilotLiveWriteEnvironment(input: {
  capturedGates: FinanceFr5PilotOperatorLiveGateCapture;
  env?: OperatorHarnessEnvMap;
}): void {
  const env = input.env ?? process.env;
  const token = env.FIREBASE_ID_TOKEN;

  for (const key of FINANCE_FR5_PILOT_OPERATOR_LIVE_GATE_KEYS) {
    const value = input.capturedGates[key];
    if (value === undefined) continue;
    env[key] = value;
  }

  Object.assign(env, { NODE_ENV: "production" });
  env.APP_ENV = "production";
  env.NEXT_PUBLIC_APP_ENV = "production";
  env.EXPECTED_ENVIRONMENT = "production";
  env.AUTH_MODE = "verified_token";

  env.EXPECTED_PROJECT_ID =
    env.EXPECTED_PROJECT_ID?.trim() || FINANCE_FR5_EXPECTED_PROJECT_ID;
  env.GOOGLE_CLOUD_PROJECT =
    env.GOOGLE_CLOUD_PROJECT?.trim() || FINANCE_FR5_EXPECTED_PROJECT_ID;

  env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY =
    env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY?.trim() || "1";
  env.FINANCE_WRITE_ENABLED = "true";
  env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  env.PRODUCTION_WRITE_ENABLED = "false";
  env.DRIVER_WRITE_ENABLED = "false";
  env.AGENT_WRITE_ENABLED = "false";
  env.CUSTOMER_WRITE_ENABLED = "false";
  env.SOURCE = "fr4_settlement_locked";
  env.FINANCE_FR1_PILOT_APPLY = "";
  env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY = "";
  env.FINANCE_FR3_RECON_PILOT_VERIFY = "";
  env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY = "";

  env.PRODUCTION_READ_ENABLED = "false";
  env.PRODUCTION_READ_MODE = "disabled";
  env.FULL_PII_SHADOW_ENABLED = "false";
  env.LIVE_SHADOW_ALLOWED_RESOURCES = "";

  delete env.GOOGLE_APPLICATION_CREDENTIALS;

  if (token !== undefined) {
    env.FIREBASE_ID_TOKEN = token;
  }

  resetEnvCache();
  resetProductionAuthSingletonsForTests();
}

export function loadFinanceFr5PilotLiveWriteEnv(): AppEnvConfig {
  return loadEnv();
}

export function envForFinanceFr5VerifiedActorResolution(
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

export function readFinanceFr5PilotOperatorGatesFromEnv(
  env: OperatorHarnessEnvMap = process.env,
): FinanceFr5OperatorGateEnv {
  return {
    FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY:
      env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY,
    FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
    AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
    CUSTOMER_WRITE_ENABLED: env.CUSTOMER_WRITE_ENABLED,
    EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT,
    SOURCE: env.SOURCE,
    FIREBASE_ID_TOKEN: env.FIREBASE_ID_TOKEN,
    FINANCE_FR1_PILOT_APPLY: env.FINANCE_FR1_PILOT_APPLY,
    FINANCE_FR2_SETTLEMENT_PILOT_APPLY: env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY,
    FINANCE_FR3_RECON_PILOT_VERIFY: env.FINANCE_FR3_RECON_PILOT_VERIFY,
    FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY:
      env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY,
  };
}
