/**
 * Phase 5J — live operator environment contract (scoped to provision harness).
 *
 * Global Vitest setup continues to clear write-arming flags and only preserves
 * PHASE5J_PROVISION_SYNTHETIC_DRIVER. When that arm is present, the live harness
 * captures operator-supplied inline write gates at module load (before beforeEach)
 * and re-applies them inside the test body — same pattern as closed Phase 5G
 * live-read env re-apply. Ordinary unit/integration tests never call this.
 */

import { PHASE_5J_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/isPhase5JSyntheticDriverProvisionEnabled";
import type { Phase5JOperatorGateEnv } from "@/application/controlled-writes/pilot/Phase5JOperatorGates";
import type { OperatorHarnessEnvMap } from "@/test/helpers/operatorHarnessEnvPreservation";

/** Keys the Phase 5J live harness may re-apply from an operator inline capture. */
export const PHASE_5J_OPERATOR_LIVE_GATE_KEYS = [
  "PHASE5I_PROVISION_SYNTHETIC_DRIVER",
  "SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED",
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
  "CUSTOMER_AUTH_WRITE_ENABLED",
  "FINANCE_WRITE_ENABLED",
  "EXPECTED_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT",
] as const;

export type Phase5JOperatorLiveGateKey =
  (typeof PHASE_5J_OPERATOR_LIVE_GATE_KEYS)[number];

export type Phase5JOperatorLiveGateCapture = {
  readonly [K in Phase5JOperatorLiveGateKey]?: string;
};

/**
 * Capture operator inline write gates at harness module load — BEFORE Vitest
 * beforeEach sanitization clears them. Only meaningful when PHASE5J arm = 1.
 */
export function capturePhase5JOperatorLiveGates(
  env: OperatorHarnessEnvMap = process.env,
): Phase5JOperatorLiveGateCapture {
  const out: Record<string, string> = {};
  for (const key of PHASE_5J_OPERATOR_LIVE_GATE_KEYS) {
    const v = env[key];
    if (v !== undefined && v !== "") {
      out[key] = v;
    }
  }
  return out as Phase5JOperatorLiveGateCapture;
}

/**
 * Re-apply captured operator gates into process.env (or test double).
 * Call ONLY from phase5j-provision-synthetic-driver live harness when armed.
 * Does not enable flags that were never supplied by the operator.
 */
export function applyPhase5JOperatorLiveEnvironment(
  captured: Phase5JOperatorLiveGateCapture,
  env: OperatorHarnessEnvMap = process.env,
): void {
  for (const key of PHASE_5J_OPERATOR_LIVE_GATE_KEYS) {
    const value = captured[key];
    if (value === undefined) {
      // Leave unset keys alone except we still force project fingerprint defaults
      // only when operator supplied EXPECTED_PROJECT_ID / GOOGLE_CLOUD_PROJECT.
      continue;
    }
    env[key] = value;
  }

  // Unrelated domains must stay explicitly false when operator did not set them.
  if (env.AGENT_WRITE_ENABLED === undefined) env.AGENT_WRITE_ENABLED = "false";
  if (env.CUSTOMER_WRITE_ENABLED === undefined)
    env.CUSTOMER_WRITE_ENABLED = "false";
  if (env.CUSTOMER_AUTH_WRITE_ENABLED === undefined)
    env.CUSTOMER_AUTH_WRITE_ENABLED = "false";
  if (env.FINANCE_WRITE_ENABLED === undefined)
    env.FINANCE_WRITE_ENABLED = "false";

  delete env.GOOGLE_APPLICATION_CREDENTIALS;
}

/** Build gate env map from process.env (after live apply) for evaluatePhase5JOperatorGates. */
export function readPhase5JOperatorGatesFromEnv(
  env: OperatorHarnessEnvMap = process.env,
): Phase5JOperatorGateEnv {
  return {
    PHASE5I_PROVISION_SYNTHETIC_DRIVER: env.PHASE5I_PROVISION_SYNTHETIC_DRIVER,
    SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED:
      env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED,
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
    AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
    CUSTOMER_WRITE_ENABLED: env.CUSTOMER_WRITE_ENABLED,
    CUSTOMER_AUTH_WRITE_ENABLED: env.CUSTOMER_AUTH_WRITE_ENABLED,
    FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
    EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT,
  };
}

/** Documented expected project fingerprint for operator commands. */
export const PHASE_5J_OPERATOR_PROJECT_FINGERPRINT =
  PHASE_5J_EXPECTED_PROJECT_ID;
