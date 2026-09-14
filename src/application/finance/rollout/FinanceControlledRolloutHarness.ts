/**
 * Controlled Finance Rollout offline orchestrator + operator harness.
 * SKIP by default. Never enables FINANCE_WRITE_ENABLED. Never live execute.
 */

import {
  FINANCE_ROLLOUT_OP_SPECS,
  FINANCE_ROLLOUT_PHASE_OPS,
  FR7_REPORTING_READ_SPEC,
  type FinanceRolloutPhase,
} from "@/application/finance/rollout/FinanceRolloutOperationSpecs";
import {
  assertFinanceWriteStillDisabled,
  captureFinanceRolloutWriteFlags,
  isPhaseFinanceControlledRolloutEnabled,
  type FinanceRolloutWriteFlagSnapshot,
} from "@/application/finance/rollout/FinanceRolloutFlags";
import { f6PolicyClosureSummary } from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceControlledRolloutHarnessResult = {
  skipped: boolean;
  reason: string;
  flags: FinanceRolloutWriteFlagSnapshot;
  f6: ReturnType<typeof f6PolicyClosureSummary>;
  phases: Record<
    FinanceRolloutPhase,
    {
      status: "PREPARED" | "SKIP" | "BLOCKED";
      ops: string[];
      notes: string;
    }
  >;
  productionWrites: 0;
  financeWriteEnabled: false;
  pilotGoNoGo: "NO-GO";
  remainingBlockers: string[];
};

export function buildFinanceControlledRolloutPreparationStatus(): FinanceControlledRolloutHarnessResult {
  assertFinanceWriteStillDisabled(FINANCE_WRITE_ENABLED_DEFAULT);
  const flags = captureFinanceRolloutWriteFlags();
  const f6 = f6PolicyClosureSummary();

  const phases = {} as FinanceControlledRolloutHarnessResult["phases"];
  for (const phase of Object.keys(FINANCE_ROLLOUT_PHASE_OPS) as FinanceRolloutPhase[]) {
    const ops = FINANCE_ROLLOUT_PHASE_OPS[phase];
    if (phase === "FR7") {
      phases[phase] = {
        status: "PREPARED",
        ops: ["reporting_read_model"],
        notes: FR7_REPORTING_READ_SPEC.description,
      };
      continue;
    }
    phases[phase] = {
      status: "PREPARED",
      ops: [...ops],
      notes: ops
        .map((op) => FINANCE_ROLLOUT_OP_SPECS[op].description)
        .join("; "),
    };
  }

  const remainingBlockers = [
    ...f6.remainingBlockers,
    "FINANCE_WRITE_ENABLED=false",
    "Production_Finance_write_GO_not_granted",
    "no_live_payout_or_settlement_execute",
    "FR1_pilot_requires_synthetic_candidate_and_explicit_arm",
  ];

  return {
    skipped: !flags.PHASE_FINANCE_CONTROLLED_ROLLOUT,
    reason: flags.PHASE_FINANCE_CONTROLLED_ROLLOUT
      ? "harness_armed_offline_only_no_production_writes"
      : "PHASE_FINANCE_CONTROLLED_ROLLOUT!=1 — SKIP by default",
    flags,
    f6,
    phases,
    productionWrites: 0,
    financeWriteEnabled: false,
    pilotGoNoGo: "NO-GO",
    remainingBlockers,
  };
}

/**
 * Operator harness — DO NOT run live.
 * Even when PHASE_FINANCE_CONTROLLED_ROLLOUT=1, only returns prep status;
 * never mutates Production.
 */
export function runFinanceControlledRolloutHarnessOffline(
  env: NodeJS.ProcessEnv = process.env,
): FinanceControlledRolloutHarnessResult {
  assertFinanceWriteStillDisabled(false);
  if (env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error("FINANCE_WRITE_ENABLED must remain false — refuse harness");
  }
  const result = buildFinanceControlledRolloutPreparationStatus();
  if (!isPhaseFinanceControlledRolloutEnabled(env)) {
    return result;
  }
  return {
    ...result,
    skipped: false,
    reason: "offline_prep_status_only — live ops not executed",
  };
}
