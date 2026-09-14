/**
 * Phase 5G — write-flag snapshot + safe observability summary.
 * All writes remain 0. No PII.
 */

import type { Phase5GInventorySelectionResult } from "@/application/controlled-writes/pilot/Phase5GSyntheticDriverInventory";

export type Phase5GWriteFlagSnapshot = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  AGENT_WRITE_ENABLED: boolean;
  CUSTOMER_WRITE_ENABLED: boolean;
  CUSTOMER_AUTH_WRITE_ENABLED: boolean;
  FINANCE_WRITE_ENABLED: boolean;
};

export const PHASE_5G_REQUIRED_WRITE_FLAGS_FALSE: Phase5GWriteFlagSnapshot = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
};

export function assertPhase5GWriteFlagsFalse(
  flags: Phase5GWriteFlagSnapshot = PHASE_5G_REQUIRED_WRITE_FLAGS_FALSE,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === false &&
    flags.PRODUCTION_WRITE_ENABLED === false &&
    flags.DRIVER_WRITE_ENABLED === false &&
    flags.AGENT_WRITE_ENABLED === false &&
    flags.CUSTOMER_WRITE_ENABLED === false &&
    flags.CUSTOMER_AUTH_WRITE_ENABLED === false &&
    flags.FINANCE_WRITE_ENABLED === false
  );
}

export type Phase5GInventoryObservabilitySummary = {
  overallStatus:
    | "INVENTORY_COMPLETE"
    | "NO_SAFE_EXISTING_PILOT"
    | "PENDING_OPERATOR"
    | "SKIPPED"
    | "FAIL";
  productionReadCompleted: boolean;
  syntheticDriversFound: number;
  safePilotCandidates: number;
  recommendedTargetId: string | null;
  recommendedCurrentState: string | null;
  recommendedAction: string | null;
  recommendedPlannedState: string | null;
  recommendation: Phase5GInventorySelectionResult["recommendation"] | null;
  activeTripImpact: false | "unknown" | null;
  financeImpact: "none" | "present" | "unknown" | null;
  authImpact: "none" | "required" | null;
  productionCalls: number;
  productionWrites: 0;
  authWrites: 0;
  financeWrites: 0;
  tripWrites: 0;
  allWriteFlagsFalseAfterRun: boolean;
  createFixture: false;
};

export function summarizePhase5GInventorySafe(
  result: Phase5GInventorySelectionResult | null,
  opts: {
    productionReadCompleted: boolean;
    productionCalls?: number;
    overallOverride?: Phase5GInventoryObservabilitySummary["overallStatus"];
    writeFlags?: Phase5GWriteFlagSnapshot;
  },
): Phase5GInventoryObservabilitySummary {
  const flags = opts.writeFlags ?? PHASE_5G_REQUIRED_WRITE_FLAGS_FALSE;
  const flagsOk = assertPhase5GWriteFlagsFalse(flags);

  if (!result) {
    return {
      overallStatus: opts.overallOverride ?? "PENDING_OPERATOR",
      productionReadCompleted: opts.productionReadCompleted,
      syntheticDriversFound: 0,
      safePilotCandidates: 0,
      recommendedTargetId: null,
      recommendedCurrentState: null,
      recommendedAction: null,
      recommendedPlannedState: null,
      recommendation: null,
      activeTripImpact: null,
      financeImpact: null,
      authImpact: null,
      productionCalls: opts.productionCalls ?? 0,
      productionWrites: 0,
      authWrites: 0,
      financeWrites: 0,
      tripWrites: 0,
      allWriteFlagsFalseAfterRun: flagsOk,
      createFixture: false,
    };
  }

  const rec = result.recommendedExistingPilot;
  const overall: Phase5GInventoryObservabilitySummary["overallStatus"] =
    opts.overallOverride ??
    (rec ? "INVENTORY_COMPLETE" : "NO_SAFE_EXISTING_PILOT");

  return {
    overallStatus: overall,
    productionReadCompleted: opts.productionReadCompleted,
    syntheticDriversFound: result.syntheticDriversFound,
    safePilotCandidates: result.safePilotCandidates.length,
    recommendedTargetId: rec?.driverId ?? null,
    recommendedCurrentState: rec?.currentState ?? null,
    recommendedAction: rec?.action ?? null,
    recommendedPlannedState: rec?.plannedState ?? null,
    recommendation: result.recommendation,
    activeTripImpact: rec ? false : null,
    financeImpact: rec ? "none" : null,
    authImpact: rec ? "none" : null,
    productionCalls: opts.productionCalls ?? 0,
    productionWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    allWriteFlagsFalseAfterRun: flagsOk,
    createFixture: false,
  };
}
