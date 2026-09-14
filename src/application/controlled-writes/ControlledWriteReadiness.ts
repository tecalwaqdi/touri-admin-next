/**
 * Phase 5 — Controlled Writes readiness scoring (offline).
 * Separates eligibility (A) from activation (B).
 */

import {
  allControlledWriteFlagsDisabled,
  CONTROLLED_WRITES_ENABLED_HARD_FALSE,
} from "@/application/controlled-writes/ControlledWriteFlags";
import {
  AGENT_WRITE_CANDIDATES,
  CUSTOMER_WRITE_CANDIDATES,
  DEFERRED_CONTROLLED_WRITE_ACTIONS,
  DRIVER_WRITE_CANDIDATES,
} from "@/application/controlled-writes/ControlledWriteCandidates";
import { CONTROLLED_WRITE_PERMISSION_BY_ACTION } from "@/application/controlled-writes/ControlledWritePermissions";
import type { ControlledWriteFlagSnapshot } from "@/application/controlled-writes/ControlledWriteTypes";

export type ControlledWritesReadinessInput = {
  shadowValidationPassed: boolean;
  eligibleForControlledWritesPhase: boolean;
  controlledWritesEnabled: boolean;
  writeFlags: ControlledWriteFlagSnapshot;
  architectureContractsPresent: boolean;
  offlinePipelineTestsPass: boolean;
  financeExcluded: boolean;
  productionCalls: number;
  productionWrites: number;
};

export type ControlledWritesReadinessReport = {
  score: number;
  verdict: "GO" | "CONDITIONAL GO" | "NO-GO";
  shadowValidationPassed: boolean;
  eligibleForControlledWritesPhase: boolean;
  controlledWritesEnabled: false;
  notes: string[];
};

export function scoreControlledWritesReadiness(
  input: ControlledWritesReadinessInput,
): ControlledWritesReadinessReport {
  const notes: string[] = [];
  let score = 0;

  if (input.shadowValidationPassed) {
    score += 20;
    notes.push("Phase 4B shadowValidationPassed");
  } else {
    notes.push("Phase 4B shadow validation not PASS");
  }

  if (input.eligibleForControlledWritesPhase) {
    score += 15;
    notes.push("eligibleForControlledWritesPhase=true (A)");
  }

  if (
    input.controlledWritesEnabled === false &&
    CONTROLLED_WRITES_ENABLED_HARD_FALSE === false
  ) {
    score += 15;
    notes.push("controlledWritesEnabled=false (B locked)");
  } else {
    notes.push("controlledWritesEnabled unexpectedly true — NO-GO");
    return {
      score: Math.min(score, 40),
      verdict: "NO-GO",
      shadowValidationPassed: input.shadowValidationPassed,
      eligibleForControlledWritesPhase: input.eligibleForControlledWritesPhase,
      controlledWritesEnabled: false,
      notes,
    };
  }

  if (allControlledWriteFlagsDisabled(input.writeFlags)) {
    score += 15;
    notes.push("All Production write flags false");
  } else {
    notes.push("Write flags not all false — NO-GO");
    return {
      score: Math.min(score, 45),
      verdict: "NO-GO",
      shadowValidationPassed: input.shadowValidationPassed,
      eligibleForControlledWritesPhase: input.eligibleForControlledWritesPhase,
      controlledWritesEnabled: false,
      notes,
    };
  }

  if (input.architectureContractsPresent) {
    score += 15;
    notes.push(
      `Candidates D=${DRIVER_WRITE_CANDIDATES.length} A=${AGENT_WRITE_CANDIDATES.length} C=${CUSTOMER_WRITE_CANDIDATES.length}; deferred=${DEFERRED_CONTROLLED_WRITE_ACTIONS.length}; permission maps=${Object.keys(CONTROLLED_WRITE_PERMISSION_BY_ACTION).length}`,
    );
  }

  if (input.offlinePipelineTestsPass) {
    score += 10;
    notes.push("Offline pipeline/contracts tests PASS");
  }

  if (input.financeExcluded) {
    score += 5;
    notes.push("Finance excluded");
  }

  if (input.productionCalls === 0 && input.productionWrites === 0) {
    score += 5;
    notes.push("Production calls=0 writes=0 this task");
  } else {
    notes.push("Unexpected Production traffic — NO-GO");
    return {
      score: Math.min(score, 50),
      verdict: "NO-GO",
      shadowValidationPassed: input.shadowValidationPassed,
      eligibleForControlledWritesPhase: input.eligibleForControlledWritesPhase,
      controlledWritesEnabled: false,
      notes,
    };
  }

  let verdict: ControlledWritesReadinessReport["verdict"] = "NO-GO";
  if (score >= 90 && input.eligibleForControlledWritesPhase) {
    // GO for future controlled write *implementation* work — not activation.
    verdict = "GO";
  } else if (score >= 75) {
    verdict = "CONDITIONAL GO";
  }

  return {
    score,
    verdict,
    shadowValidationPassed: input.shadowValidationPassed,
    eligibleForControlledWritesPhase: input.eligibleForControlledWritesPhase,
    controlledWritesEnabled: false,
    notes,
  };
}

/**
 * Transaction / concurrency strategy (design contract — no Production txn yet).
 *
 * 1. Precondition read of target doc (and for agent activate: active peers in country).
 * 2. Compare expected preconditionToken / status axes — DENY on mismatch.
 * 3. Agent activate: DENY if another active agent exists; never auto-deactivate.
 * 4. Future Production apply MUST use Firestore transaction (or equivalent)
 *    that re-checks preconditions atomically before write.
 * 5. Idempotency record written after successful apply (or reserved before with
 *    pending state in a later phase).
 * 6. Failure-safe: any thrown error after audit intent → audit result denied/failed;
 *    productionWriteExecuted remains false when repository is disabled.
 */
export const CONTROLLED_WRITE_TRANSACTION_STRATEGY = {
  concurrency: "transaction_or_precondition_token",
  agentActivatePolicy: "deny_if_other_active_no_auto_deactivate",
  blindOverwrite: false,
  productionTransactionsImplemented: false,
} as const;

export const FAKE_EMULATOR_VALIDATION_PLAN = [
  "Unit/FakeOffline pipeline: all candidate actions deny when flags false",
  "Unit/FakeOffline pipeline: with allowFakeOfflineExecution, preconditions/RBAC/scope/idempotency/audit covered",
  "Emulator (future): seed Drivers/Agents/Customers; run candidate mutations against emulator only",
  "Emulator (future): prove agent activate DENY when second active agent exists",
  "Emulator (future): prove idempotent replay and precondition token conflict",
  "Emulator (future): prove audit intent+result without raw PII",
  "Production write tests: NOT RUN in Phase 5 readiness",
  "Finance mutations: NOT IN SCOPE",
] as const;
