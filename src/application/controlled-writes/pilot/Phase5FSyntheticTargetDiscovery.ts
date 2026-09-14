/**
 * Phase 5F — Bounded synthetic Pilot target discovery (selection policy).
 * Pure / offline-safe over already-read candidate snapshots.
 * Does NOT create records. Does NOT invent planned IDs as fallbacks.
 */

import {
  evaluateSyntheticPilotTargetEligibility,
  type Phase5FEligibilityResult,
  type Phase5FSafeEligibilityFacts,
} from "@/application/controlled-writes/pilot/Phase5FSyntheticTargetEligibility";
import { PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET } from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";

export type Phase5FDiscoveryCandidate = {
  documentId: string;
  data: Record<string, unknown>;
};

export type Phase5FDiscoveryResult =
  | {
      targetFound: true;
      targetId: string;
      synthetic: true;
      currentState: "pending_review";
      activeTrip: false;
      financeImpact: "none";
      eligibleCount: number;
      scannedCount: number;
      selectedFacts: Phase5FSafeEligibilityFacts;
      /** All eligible ids in deterministic documentId order (safe ids only). */
      eligibleIdsOrdered: readonly string[];
      reason: null;
      dryRunStatus: null;
      plannedIdUsedAsFallback: false;
    }
  | {
      targetFound: false;
      targetId: null;
      synthetic: false;
      currentState: null;
      activeTrip: null;
      financeImpact: null;
      eligibleCount: 0;
      scannedCount: number;
      selectedFacts: null;
      eligibleIdsOrdered: readonly [];
      reason: "NO_SAFE_SYNTHETIC_DRIVER_EXISTS";
      dryRunStatus: "NO_GO";
      plannedIdUsedAsFallback: false;
    };

/**
 * Discover a safe synthetic Driver target from bounded candidate reads.
 *
 * Selection:
 * - zero eligible → targetFound=false, NO_GO, NO_SAFE_SYNTHETIC_DRIVER_EXISTS
 * - one or more → deterministic ascending documentId order; pick first
 *
 * Never injects PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET unless it appears
 * in the candidate set and independently validates.
 */
export function discoverSyntheticPilotTarget(
  candidates: readonly Phase5FDiscoveryCandidate[],
): Phase5FDiscoveryResult {
  const scannedCount = candidates.length;
  const evaluations: Phase5FEligibilityResult[] = candidates.map((c) =>
    evaluateSyntheticPilotTargetEligibility({
      documentId: c.documentId,
      data: c.data,
    }),
  );

  const eligible = evaluations
    .filter((e) => e.eligible)
    .sort((a, b) => a.facts.documentId.localeCompare(b.facts.documentId));

  const eligibleIdsOrdered = eligible.map((e) => e.facts.documentId);

  if (eligible.length === 0) {
    // Explicitly refuse planned-id fallback even if string appears in code.
    void PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET;
    return {
      targetFound: false,
      targetId: null,
      synthetic: false,
      currentState: null,
      activeTrip: null,
      financeImpact: null,
      eligibleCount: 0,
      scannedCount,
      selectedFacts: null,
      eligibleIdsOrdered: [],
      reason: "NO_SAFE_SYNTHETIC_DRIVER_EXISTS",
      dryRunStatus: "NO_GO",
      plannedIdUsedAsFallback: false,
    };
  }

  const selected = eligible[0]!;
  return {
    targetFound: true,
    targetId: selected.facts.documentId,
    synthetic: true,
    currentState: "pending_review",
    activeTrip: false,
    financeImpact: "none",
    eligibleCount: eligible.length,
    scannedCount,
    selectedFacts: selected.facts,
    eligibleIdsOrdered,
    reason: null,
    dryRunStatus: null,
    plannedIdUsedAsFallback: false,
  };
}

/**
 * Guard: planned strategy id is valid ONLY when present in discovery results
 * as an eligible target (exists + validates). Never invent.
 */
export function isPlannedSyntheticIdValidOnlyIfDiscovered(
  discovery: Phase5FDiscoveryResult,
  plannedId: string = PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET,
): boolean {
  if (!discovery.targetFound) return false;
  return discovery.eligibleIdsOrdered.includes(plannedId);
}
