/**
 * Phase 4B — closing gates for cross-resource shadow validation.
 * Legitimate not_represented / excluded* / testOrNoncanonical are NOT blockers.
 */

import type {
  Phase4BCrossResourceCounters,
  Phase4BShadowSummary,
} from "@/application/shadow-validation/Phase4BShadowSummary";
import { PHASE_4B_EXPECTED_PROJECT_ID } from "@/application/shadow-validation/Phase4BShadowSummary";

export type Phase4BClosingGateInput = {
  crossResource: Phase4BCrossResourceCounters;
  productionWrites: number;
  killSwitchPass: boolean;
  scopeValidationPass: boolean;
  paginationValidationPass: boolean;
  projectFingerprint: string;
  expectedProjectId?: string;
  unexpectedCollectionAccess?: number;
};

export function collectPhase4BClosingBlockers(
  input: Phase4BClosingGateInput,
): string[] {
  const blockers: string[] = [];
  const c = input.crossResource;
  const expected = input.expectedProjectId ?? PHASE_4B_EXPECTED_PROJECT_ID;

  if (input.projectFingerprint !== expected) {
    blockers.push("project_fingerprint_mismatch");
  }
  if (c.brokenCountryReferences > 0) {
    blockers.push("broken_required_country_references");
  }
  if (c.brokenCityReferences > 0) {
    blockers.push("broken_required_city_references");
  }
  if (c.crossDomainConflicts > 0) {
    blockers.push("unresolved_cross_domain_operational_conflicts");
  }
  if (c.countriesWithMultipleActiveAgents > 0) {
    blockers.push("countries_with_multiple_active_agents");
  }
  if (c.piiViolations > 0) {
    blockers.push("pii_violations");
  }
  if (c.financialConflicts > 0 || c.financialMissingAsZero > 0) {
    blockers.push("financial_conflicts");
  }
  if (c.scopeViolations > 0 || !input.scopeValidationPass) {
    blockers.push("scope_violation");
  }
  if (c.paginationDuplicates > 0 || !input.paginationValidationPass) {
    blockers.push("pagination_duplicate_or_regression");
  }
  const unexpected =
    input.unexpectedCollectionAccess ?? c.unexpectedCollectionAccess;
  if (unexpected > 0) {
    blockers.push("unexpected_collection_access");
  }
  if (input.productionWrites > 0) {
    blockers.push("production_writes");
  }
  if (!input.killSwitchPass) {
    blockers.push("kill_switch_failure");
  }
  return blockers;
}

export function phase4BClosingGatesPass(
  input: Phase4BClosingGateInput,
): boolean {
  return collectPhase4BClosingBlockers(input).length === 0;
}

export type Phase4BWriteReadinessInput = Pick<
  Phase4BShadowSummary,
  "overallStatus" | "productionWrites" | "killSwitchPass" | "writeTrapsPass"
>;

/**
 * Shadow validation closed successfully (PASS only).
 */
export function isShadowValidationPassed(
  summary: Pick<Phase4BShadowSummary, "overallStatus">,
): boolean {
  return summary.overallStatus === "PASS";
}

/**
 * Semantics A — eligible to BEGIN Controlled Writes readiness work.
 * Requires Phase 4B PASS + write traps + kill switch + zero Production writes.
 * Does NOT authorize any Production mutation.
 */
export function isEligibleForControlledWritesPhase(
  summary: Phase4BWriteReadinessInput,
): boolean {
  return (
    summary.overallStatus === "PASS" &&
    summary.productionWrites === 0 &&
    summary.killSwitchPass &&
    summary.writeTrapsPass
  );
}

/**
 * Semantics B — write execution activation.
 * Phase 4B / Phase 5 readiness NEVER enable this.
 * Always false here; future activation is a separate explicit phase.
 */
export function isControlledWritesEnabled(
  _summary?: Phase4BWriteReadinessInput,
): boolean {
  void _summary;
  return false;
}

/**
 * Alias of isEligibleForControlledWritesPhase (A).
 * Prefer explicit eligibleForControlledWritesPhase vs controlledWritesEnabled.
 */
export function isReadyForControlledWrites(
  summary: Phase4BWriteReadinessInput,
): boolean {
  return isEligibleForControlledWritesPhase(summary);
}

export function derivePhase4BWriteReadinessFlags(
  summary: Phase4BWriteReadinessInput,
): {
  shadowValidationPassed: boolean;
  eligibleForControlledWritesPhase: boolean;
  controlledWritesEnabled: boolean;
  readyForControlledWrites: boolean;
} {
  const shadowValidationPassed = isShadowValidationPassed(summary);
  const eligibleForControlledWritesPhase =
    isEligibleForControlledWritesPhase(summary);
  const controlledWritesEnabled = isControlledWritesEnabled(summary);
  return {
    shadowValidationPassed,
    eligibleForControlledWritesPhase,
    controlledWritesEnabled,
    readyForControlledWrites: eligibleForControlledWritesPhase,
  };
}
