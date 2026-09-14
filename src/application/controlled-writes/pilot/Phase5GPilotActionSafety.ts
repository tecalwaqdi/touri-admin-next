/**
 * Phase 5G — Pilot action safety ranking for existing synthetic Drivers.
 * Only evaluate implemented admin actions with valid state-machine transitions.
 * Prefer lowest blast radius. No invented commands.
 */

import type {
  DriverControlledWriteAction,
  ProvenDriverRegistrationState,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type { CanonicalDriverRegistrationStatus } from "@/domain/driver/CanonicalDriverRegistrationStatus";
import {
  resolveDriverTransition,
  targetStateForAction,
} from "@/application/controlled-writes/drivers/DriverStateMachine";
import type { Phase5GSyntheticInventoryRecord } from "@/application/controlled-writes/pilot/Phase5GInventoryRecord";

export type Phase5GPilotSafetyRank =
  | "SAFE"
  | "ACCEPTABLE_WITH_CAUTION"
  | "UNSAFE";

export type Phase5GBlastRadius = "low" | "medium" | "high";

/** Preference among valid actions (lower index = preferred). */
export const PHASE_5G_ACTION_PREFERENCE: readonly DriverControlledWriteAction[] =
  ["needs_changes", "reject", "suspend", "approve"] as const;

const BLAST_BY_ACTION: Record<DriverControlledWriteAction, Phase5GBlastRadius> =
  {
    needs_changes: "low",
    reject: "medium",
    suspend: "medium",
    approve: "medium",
  };

const BLAST_RANK: Record<Phase5GBlastRadius, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const SAFETY_RANK_ORDER: Record<Phase5GPilotSafetyRank, number> = {
  SAFE: 0,
  ACCEPTABLE_WITH_CAUTION: 1,
  UNSAFE: 2,
};

export type Phase5GTargetActionCandidate = {
  driverId: string;
  currentState: CanonicalDriverRegistrationStatus;
  action: DriverControlledWriteAction;
  plannedState: CanonicalDriverRegistrationStatus;
  syntheticEvidenceKind: Phase5GSyntheticInventoryRecord["syntheticEvidenceKind"];
  activeTrip: boolean;
  financeImpact: Phase5GSyntheticInventoryRecord["financeImpactClassification"];
  authImpact: "none" | "required";
  safetyRank: Phase5GPilotSafetyRank;
  blastRadius: Phase5GBlastRadius;
  recordSafePilotEligible: boolean;
  denialReasons: readonly string[];
};

function rankActionSafety(
  action: DriverControlledWriteAction,
  record: Phase5GSyntheticInventoryRecord,
): { safetyRank: Phase5GPilotSafetyRank; denialReasons: string[] } {
  const denials: string[] = [];

  if (!record.safePilotEligible) {
    denials.push("BASE_ELIGIBILITY_FAILED");
    return { safetyRank: "UNSAFE", denialReasons: denials };
  }
  if (record.hasActiveTrip || record.tripState !== "idle") {
    denials.push("ACTIVE_TRIP_OR_UNKNOWN");
    return { safetyRank: "UNSAFE", denialReasons: denials };
  }
  if (record.financeImpactClassification !== "none") {
    denials.push("FINANCE_IMPACT");
    return { safetyRank: "UNSAFE", denialReasons: denials };
  }
  if (record.authDependency) {
    denials.push("AUTH_DEPENDENCY");
    return { safetyRank: "UNSAFE", denialReasons: denials };
  }

  // Qualitative blast / reversibility (aligned with Phase 5E safest first Pilot).
  switch (action) {
    case "needs_changes":
      // pending_review → needs_changes: inactive account, reversible via resubmit.
      return { safetyRank: "SAFE", denialReasons: denials };
    case "reject":
      // Terminal-ish; account stays inactive but harder to reverse via admin cmds.
      return {
        safetyRank: "ACCEPTABLE_WITH_CAUTION",
        denialReasons: denials,
      };
    case "suspend":
      // Disables approved path; requires careful trip/account understanding.
      if (record.accountEnabled === "unknown") {
        denials.push("ACCOUNT_BEHAVIOR_UNKNOWN");
        return { safetyRank: "UNSAFE", denialReasons: denials };
      }
      return {
        safetyRank: "ACCEPTABLE_WITH_CAUTION",
        denialReasons: denials,
      };
    case "approve":
      // Activates / reactivates operational path — higher blast than needs_changes.
      return {
        safetyRank: "ACCEPTABLE_WITH_CAUTION",
        denialReasons: denials,
      };
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      denials.push("UNKNOWN_ACTION");
      return { safetyRank: "UNSAFE", denialReasons: denials };
    }
  }
}

/**
 * Enumerate valid (record × action) candidates with safety ranks.
 * Invalid transitions are omitted (not invented).
 */
export function enumeratePhase5GTargetActionCandidates(
  record: Phase5GSyntheticInventoryRecord,
): Phase5GTargetActionCandidate[] {
  const actions = PHASE_5G_ACTION_PREFERENCE;
  const out: Phase5GTargetActionCandidate[] = [];

  for (const action of actions) {
    const from = record.registrationStatus as ProvenDriverRegistrationState;
    const resolved = resolveDriverTransition(action, from);
    // Invalid / unknown-from transitions omitted — do not invent commands.
    if (!resolved.ok) continue;

    const { safetyRank, denialReasons } = rankActionSafety(action, record);
    out.push({
      driverId: record.sourceDocumentId,
      currentState: record.registrationStatus,
      action,
      plannedState: resolved.to,
      syntheticEvidenceKind: record.syntheticEvidenceKind,
      activeTrip: record.hasActiveTrip,
      financeImpact: record.financeImpactClassification,
      authImpact: record.authDependency ? "required" : "none",
      safetyRank,
      blastRadius: BLAST_BY_ACTION[action],
      recordSafePilotEligible: record.safePilotEligible,
      denialReasons,
    });
  }

  return out;
}

/** Comparator for §14: safety → blast → action preference → documentId. */
export function comparePhase5GTargetActionCandidates(
  a: Phase5GTargetActionCandidate,
  b: Phase5GTargetActionCandidate,
): number {
  const s = SAFETY_RANK_ORDER[a.safetyRank] - SAFETY_RANK_ORDER[b.safetyRank];
  if (s !== 0) return s;
  const bl = BLAST_RANK[a.blastRadius] - BLAST_RANK[b.blastRadius];
  if (bl !== 0) return bl;
  const ap =
    PHASE_5G_ACTION_PREFERENCE.indexOf(a.action) -
    PHASE_5G_ACTION_PREFERENCE.indexOf(b.action);
  if (ap !== 0) return ap;
  return a.driverId.localeCompare(b.driverId);
}

export function plannedStateForAction(
  action: DriverControlledWriteAction,
): CanonicalDriverRegistrationStatus {
  return targetStateForAction(action);
}
