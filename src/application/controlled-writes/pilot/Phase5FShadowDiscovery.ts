/**
 * Phase 5F — Bounded read-only discovery over Drivers shadow query results.
 * Accepts already-fetched `user` docs (ismndob page). No writes. No PII emit.
 */

import {
  discoverSyntheticPilotTarget,
  type Phase5FDiscoveryCandidate,
  type Phase5FDiscoveryResult,
} from "@/application/controlled-writes/pilot/Phase5FSyntheticTargetDiscovery";
import { classifyProvenSyntheticDriver } from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";

/** Hard cap — one bounded page, same order of magnitude as Phase 4A-5. */
export const PHASE_5F_DISCOVERY_MAX_SCAN = 50 as const;

export type Phase5FShadowUserDoc = {
  id: string;
  data: Record<string, unknown>;
};

/**
 * Filter to proven-synthetic marker docs first (no fuzzy names), then run
 * full eligibility + deterministic selection.
 */
export function discoverSyntheticPilotTargetFromShadowDocs(
  docs: readonly Phase5FShadowUserDoc[],
  maxScan: number = PHASE_5F_DISCOVERY_MAX_SCAN,
): Phase5FDiscoveryResult {
  const bounded = docs.slice(0, maxScan);
  const candidates: Phase5FDiscoveryCandidate[] = [];

  for (const doc of bounded) {
    // Search ONLY records satisfying proven synthetic conventions.
    const synthetic = classifyProvenSyntheticDriver({
      documentId: doc.id,
      data: doc.data,
    });
    if (!synthetic.ok) continue;
    candidates.push({ documentId: doc.id, data: doc.data });
  }

  return discoverSyntheticPilotTarget(candidates);
}

/**
 * Safe discovery summary for reports — no email/phone/bank/FCM.
 */
export function summarizeDiscoverySafe(result: Phase5FDiscoveryResult): {
  targetFound: boolean;
  targetId: string | null;
  synthetic: boolean;
  currentState: string | null;
  activeTrip: boolean | null;
  financeImpact: "none" | "present" | null;
  eligibleCount: number;
  scannedProvenSyntheticOnly: true;
  reason: string | null;
} {
  if (!result.targetFound) {
    return {
      targetFound: false,
      targetId: null,
      synthetic: false,
      currentState: null,
      activeTrip: null,
      financeImpact: null,
      eligibleCount: 0,
      scannedProvenSyntheticOnly: true,
      reason: result.reason,
    };
  }
  return {
    targetFound: true,
    targetId: result.targetId,
    synthetic: true,
    currentState: result.currentState,
    activeTrip: result.activeTrip,
    financeImpact: result.financeImpact,
    eligibleCount: result.eligibleCount,
    scannedProvenSyntheticOnly: true,
    reason: null,
  };
}
