/**
 * FR1 registry fixture — scoped live operator env (create-only registry path).
 *
 * Global Vitest beforeEach clears EXPECTED_PROJECT_ID and write flags.
 * Live harness captures operator inline env at module load and re-applies when armed.
 * Preserve list (global) only restores FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE —
 * never write-enabling flags.
 */

import type { OperatorHarnessEnvMap } from "@/test/helpers/operatorHarnessEnvPreservation";
import { FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";

export const FINANCE_FR1_FIXTURE_OPERATOR_LIVE_GATE_KEYS = [
  "FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE",
  "FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE_DRY_RUN",
  "TARGET",
  "DOCUMENT_ID",
  "IDEMPOTENCY_KEY",
  "EXPECTED_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT",
  "FINANCE_WRITE_ENABLED",
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
] as const;

export type FinanceFr1FixtureOperatorLiveGateKey =
  (typeof FINANCE_FR1_FIXTURE_OPERATOR_LIVE_GATE_KEYS)[number];

export type FinanceFr1FixtureOperatorLiveGateCapture = {
  readonly [K in FinanceFr1FixtureOperatorLiveGateKey]?: string;
};

export function captureFinanceFr1FixtureOperatorLiveGates(
  env: OperatorHarnessEnvMap = process.env,
): FinanceFr1FixtureOperatorLiveGateCapture {
  const out: Record<string, string> = {};
  for (const key of FINANCE_FR1_FIXTURE_OPERATOR_LIVE_GATE_KEYS) {
    const v = env[key];
    if (v !== undefined && v !== "") out[key] = v;
  }
  return out as FinanceFr1FixtureOperatorLiveGateCapture;
}

/**
 * Re-apply operator gates for armed live create. Forces write-enabling flags false.
 * Deletes GOOGLE_APPLICATION_CREDENTIALS (ADC only).
 */
export function applyFinanceFr1FixtureOperatorLiveEnvironment(
  captured: FinanceFr1FixtureOperatorLiveGateCapture,
  env: OperatorHarnessEnvMap = process.env,
): void {
  for (const key of FINANCE_FR1_FIXTURE_OPERATOR_LIVE_GATE_KEYS) {
    const value = captured[key];
    if (value === undefined) continue;
    env[key] = value;
  }
  // Domain / Production / Finance write arms must stay false for registry fixture create.
  env.FINANCE_WRITE_ENABLED = "false";
  env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  env.PRODUCTION_WRITE_ENABLED = "false";
  env.DRIVER_WRITE_ENABLED = "false";
  env.AGENT_WRITE_ENABLED = "false";
  env.CUSTOMER_WRITE_ENABLED = "false";
  if (!env.EXPECTED_PROJECT_ID) {
    env.EXPECTED_PROJECT_ID = FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID;
  }
  if (!env.GOOGLE_CLOUD_PROJECT) {
    env.GOOGLE_CLOUD_PROJECT = FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID;
  }
  if (!env.TARGET) env.TARGET = "registry";
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
}
