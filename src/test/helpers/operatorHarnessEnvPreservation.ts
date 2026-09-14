/**
 * Operator harness env preservation for Vitest global setup.
 *
 * Capture approved operator flags at setup module load (before beforeEach wipe).
 * Restore them after each sanitization. Never preserve Production write-arming flags.
 *
 * Phase 5G: PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY (read-only live inventory)
 * Phase 5I: PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN (offline plan-only dry-run)
 * Phase 5J: PHASE5J_PROVISION_SYNTHETIC_DRIVER (harness arm only — NOT write flags)
 * Phase 5K: PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE (read-only fixture verify)
 * Phase 5L: PHASE5L_DRIVER_PILOT_DRY_RUN (plan-only Driver Pilot dry-run)
 * Phase 5L: FIREBASE_ID_TOKEN (verified actor token for live dry-run — never log)
 * Phase 5M: PHASE5M_DRIVER_PILOT_APPLY (harness arm only — NOT write flags)
 * Phase 5N: PHASE5N_METADATA_RECONCILE_DRY_RUN (read-only plan)
 * Phase 5N: PHASE5N_METADATA_RECONCILE_APPLY (harness arm only — NOT write flags)
 * Finance FR1: FINANCE_FR1_PILOT_APPLY (harness arm only — NOT write flags)
 * Finance FR1 fixture: FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE (harness arm only)
 * Finance FR1 fixture dry-run: FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE_DRY_RUN
 * Finance FR1 registry verify: FINANCE_FR1_REGISTRY_FIXTURE_VERIFY (RO arm only)
 * Finance FR1 registry pilot: FINANCE_FR1_REGISTRY_PILOT (consume gate only — NOT write flags)
 * Finance FR2: FINANCE_FR2_SETTLEMENT_PILOT_APPLY (harness arm only — NOT write flags)
 * Finance FR3: FINANCE_FR3_RECON_PILOT_VERIFY (read-only live verify — NOT write flags)
 * Finance FR4: FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY (harness arm only — NOT write flags)
 * Finance FR5: FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY (harness arm only — NOT write flags)
 * Finance FR6: FINANCE_FR6_ADJUSTMENT_PILOT_APPLY (harness arm only — NOT write flags)
 * Finance FR7: FINANCE_FR7_REPORTING_PILOT_VERIFY (read-only live verify — NOT write flags)
 */

export const OPERATOR_HARNESS_PRESERVE_KEYS = [
  "PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY",
  "PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN",
  "PHASE5J_PROVISION_SYNTHETIC_DRIVER",
  "PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE",
  "PHASE5L_DRIVER_PILOT_DRY_RUN",
  "PHASE5M_DRIVER_PILOT_APPLY",
  "PHASE5N_METADATA_RECONCILE_DRY_RUN",
  "PHASE5N_METADATA_RECONCILE_APPLY",
  "PHASE_FINANCE_SHADOW",
  "PHASE_FINANCE_CONTROLLED_ROLLOUT",
  "FINANCE_FR1_PILOT_APPLY",
  "FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE",
  "FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE_DRY_RUN",
  "FINANCE_FR1_REGISTRY_FIXTURE_VERIFY",
  "FINANCE_FR1_REGISTRY_PILOT",
  "FINANCE_FR2_SETTLEMENT_PILOT_APPLY",
  "FINANCE_FR3_RECON_PILOT_VERIFY",
  "FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY",
  "FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY",
  "FINANCE_FR6_ADJUSTMENT_PILOT_APPLY",
  "FINANCE_FR7_REPORTING_PILOT_VERIFY",
  "FIREBASE_ID_TOKEN",
] as const;

export type OperatorHarnessPreserveKey =
  (typeof OPERATOR_HARNESS_PRESERVE_KEYS)[number];

/** Must never be implicitly trusted / restored by harness preservation. */
export const OPERATOR_HARNESS_NEVER_PRESERVE_KEYS = [
  "PHASE5I_PROVISION_SYNTHETIC_DRIVER",
  "SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED",
  "GLOBAL_PRODUCTION_WRITE_ENABLED",
  "PRODUCTION_WRITE_ENABLED",
  "DRIVER_WRITE_ENABLED",
  "AGENT_WRITE_ENABLED",
  "CUSTOMER_WRITE_ENABLED",
  "CUSTOMER_AUTH_WRITE_ENABLED",
  "FINANCE_WRITE_ENABLED",
] as const;

export type OperatorHarnessNeverPreserveKey =
  (typeof OPERATOR_HARNESS_NEVER_PRESERVE_KEYS)[number];

export type CapturedOperatorHarnessEnv = {
  readonly [K in OperatorHarnessPreserveKey]: string | undefined;
};

/** Mutable env map — process.env or an isolated test double. */
export type OperatorHarnessEnvMap = Record<string, string | undefined>;

export function captureOperatorHarnessEnv(
  env: OperatorHarnessEnvMap = process.env,
): CapturedOperatorHarnessEnv {
  return {
    PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY:
      env.PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY,
    PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN:
      env.PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN,
    PHASE5J_PROVISION_SYNTHETIC_DRIVER:
      env.PHASE5J_PROVISION_SYNTHETIC_DRIVER,
    PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE:
      env.PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE,
    PHASE5L_DRIVER_PILOT_DRY_RUN: env.PHASE5L_DRIVER_PILOT_DRY_RUN,
    PHASE5M_DRIVER_PILOT_APPLY: env.PHASE5M_DRIVER_PILOT_APPLY,
    PHASE5N_METADATA_RECONCILE_DRY_RUN: env.PHASE5N_METADATA_RECONCILE_DRY_RUN,
    PHASE5N_METADATA_RECONCILE_APPLY: env.PHASE5N_METADATA_RECONCILE_APPLY,
    PHASE_FINANCE_SHADOW: env.PHASE_FINANCE_SHADOW,
    PHASE_FINANCE_CONTROLLED_ROLLOUT: env.PHASE_FINANCE_CONTROLLED_ROLLOUT,
    FINANCE_FR1_PILOT_APPLY: env.FINANCE_FR1_PILOT_APPLY,
    FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE:
      env.FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE,
    FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE_DRY_RUN:
      env.FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE_DRY_RUN,
    FINANCE_FR1_REGISTRY_FIXTURE_VERIFY:
      env.FINANCE_FR1_REGISTRY_FIXTURE_VERIFY,
    FINANCE_FR1_REGISTRY_PILOT: env.FINANCE_FR1_REGISTRY_PILOT,
    FINANCE_FR2_SETTLEMENT_PILOT_APPLY: env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY,
    FINANCE_FR3_RECON_PILOT_VERIFY: env.FINANCE_FR3_RECON_PILOT_VERIFY,
    FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY:
      env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY,
    FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY:
      env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY,
    FINANCE_FR6_ADJUSTMENT_PILOT_APPLY: env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY,
    FINANCE_FR7_REPORTING_PILOT_VERIFY: env.FINANCE_FR7_REPORTING_PILOT_VERIFY,
    FIREBASE_ID_TOKEN: env.FIREBASE_ID_TOKEN,
  };
}

/**
 * Clear write-arming operator flags that must not survive sanitization.
 * Does not touch approved preserve keys (caller restores those after).
 */
export function clearNeverPreserveOperatorHarnessEnv(
  env: OperatorHarnessEnvMap = process.env,
): void {
  for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
    delete env[key];
  }
}

/** Restore only approved operator harness flags from a prior capture. */
export function restoreOperatorHarnessEnv(
  captured: CapturedOperatorHarnessEnv,
  env: OperatorHarnessEnvMap = process.env,
): void {
  for (const key of OPERATOR_HARNESS_PRESERVE_KEYS) {
    const value = captured[key];
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
}

/**
 * Apply global Vitest sanitization contract for operator harness flags:
 * clear never-preserve arms, then restore approved preserve keys.
 */
export function applyOperatorHarnessEnvSanitization(
  captured: CapturedOperatorHarnessEnv,
  env: OperatorHarnessEnvMap = process.env,
): void {
  clearNeverPreserveOperatorHarnessEnv(env);
  restoreOperatorHarnessEnv(captured, env);
}
