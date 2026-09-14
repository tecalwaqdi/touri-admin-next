/**
 * Controlled Finance Rollout flags — hard safety.
 * FINANCE_WRITE_ENABLED stays false. Harness SKIP by default.
 */

export const FINANCE_WRITE_ENABLED_HARD_FALSE = false as const;

/** Operator harness env — never auto-enables writes. */
export const PHASE_FINANCE_CONTROLLED_ROLLOUT_ENV =
  "PHASE_FINANCE_CONTROLLED_ROLLOUT" as const;

export function isPhaseFinanceControlledRolloutEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[PHASE_FINANCE_CONTROLLED_ROLLOUT_ENV] === "1";
}

export type FinanceRolloutWriteFlagSnapshot = {
  FINANCE_WRITE_ENABLED: false;
  GLOBAL_PRODUCTION_WRITE_ENABLED: false;
  PRODUCTION_WRITE_ENABLED: false;
  PHASE_FINANCE_CONTROLLED_ROLLOUT: boolean;
};

export function captureFinanceRolloutWriteFlags(
  env: NodeJS.ProcessEnv = process.env,
): FinanceRolloutWriteFlagSnapshot {
  return {
    FINANCE_WRITE_ENABLED: false,
    GLOBAL_PRODUCTION_WRITE_ENABLED: false,
    PRODUCTION_WRITE_ENABLED: false,
    PHASE_FINANCE_CONTROLLED_ROLLOUT:
      isPhaseFinanceControlledRolloutEnabled(env),
  };
}

export function assertFinanceWriteStillDisabled(
  flag: boolean = FINANCE_WRITE_ENABLED_HARD_FALSE,
): void {
  if (flag) {
    throw new Error(
      "FINANCE_WRITE_ENABLED must remain false during controlled Finance rollout preparation",
    );
  }
}
