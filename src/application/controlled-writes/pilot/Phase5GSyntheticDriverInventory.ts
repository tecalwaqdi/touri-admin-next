/**
 * Phase 5G — Inventory over bounded shadow docs + safest Pilot selection.
 * READ-ONLY. Does not create fixtures. Does not mutate Production.
 */

import {
  buildPhase5GInventoryRecord,
  type Phase5GSyntheticInventoryRecord,
} from "@/application/controlled-writes/pilot/Phase5GInventoryRecord";
import {
  comparePhase5GTargetActionCandidates,
  enumeratePhase5GTargetActionCandidates,
  type Phase5GTargetActionCandidate,
} from "@/application/controlled-writes/pilot/Phase5GPilotActionSafety";
import type { CanonicalDriverRegistrationStatus } from "@/domain/driver/CanonicalDriverRegistrationStatus";
import type { DriverControlledWriteAction } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type { Phase5GSyntheticEvidenceKind } from "@/application/controlled-writes/pilot/Phase5GSyntheticEvidence";

/** Hard cap — reuse Phase 5F / 4A-5 Drivers page bound. */
export const PHASE_5G_INVENTORY_MAX_SCAN = 50 as const;

export type Phase5GShadowUserDoc = {
  id: string;
  data: Record<string, unknown>;
  mappingStatus?: string | null;
};

export type Phase5GRecommendedExistingPilot = {
  driverId: string;
  currentState: CanonicalDriverRegistrationStatus;
  action: DriverControlledWriteAction;
  plannedState: CanonicalDriverRegistrationStatus;
  syntheticEvidenceKind: Phase5GSyntheticEvidenceKind;
  activeTrip: false;
  financeImpact: "none";
  authImpact: "none";
  safetyRank: "SAFE";
};

export type Phase5GInventorySelectionResult = {
  scannedCount: number;
  syntheticDriversFound: number;
  inventory: readonly Phase5GSyntheticInventoryRecord[];
  /** Counts by registrationStatus among proven synthetics. */
  stateDistribution: Readonly<
    Record<CanonicalDriverRegistrationStatus, number>
  >;
  /** Candidates with safetyRank === SAFE (base + valid transition). */
  safePilotCandidates: readonly Phase5GTargetActionCandidate[];
  /** All non-UNSAFE ranked candidates (informational). */
  cautionPilotCandidates: readonly Phase5GTargetActionCandidate[];
  recommendedExistingPilot: Phase5GRecommendedExistingPilot | null;
  recommendation:
    | "USE_EXISTING_SYNTHETIC_PILOT"
    | "PREPARE_DEDICATED_SYNTHETIC_PRODUCTION_FIXTURE";
  /** Always false here — creation is a separate reviewed phase. */
  createFixture: false;
};

function emptyStateDistribution(): Record<
  CanonicalDriverRegistrationStatus,
  number
> {
  return {
    draft: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    needs_changes: 0,
    suspended: 0,
    unknown: 0,
  };
}

/**
 * Inventory proven synthetics under ANY state, then select exactly one SAFE
 * existing-target Pilot — or recommend dedicated fixture preparation (do not create).
 */
export function runPhase5GSyntheticDriverInventory(
  docs: readonly Phase5GShadowUserDoc[],
  maxScan: number = PHASE_5G_INVENTORY_MAX_SCAN,
): Phase5GInventorySelectionResult {
  const bounded = docs.slice(0, maxScan);
  const inventory: Phase5GSyntheticInventoryRecord[] = [];

  for (const doc of bounded) {
    // Never reclassify excludedUnknownIdentity as synthetic.
    if (doc.mappingStatus === "excludedUnknownIdentity") continue;
    const row = buildPhase5GInventoryRecord({
      documentId: doc.id,
      data: doc.data,
      mappingStatus: doc.mappingStatus,
    });
    if (row) inventory.push(row);
  }

  inventory.sort((a, b) =>
    a.sourceDocumentId.localeCompare(b.sourceDocumentId),
  );

  const stateDistribution = emptyStateDistribution();
  for (const row of inventory) {
    stateDistribution[row.registrationStatus] += 1;
  }

  const allCandidates: Phase5GTargetActionCandidate[] = [];
  for (const row of inventory) {
    allCandidates.push(...enumeratePhase5GTargetActionCandidates(row));
  }
  allCandidates.sort(comparePhase5GTargetActionCandidates);

  const safePilotCandidates = allCandidates.filter(
    (c) =>
      c.safetyRank === "SAFE" &&
      c.activeTrip === false &&
      c.financeImpact === "none" &&
      c.authImpact === "none" &&
      c.recordSafePilotEligible,
  );
  const cautionPilotCandidates = allCandidates.filter(
    (c) => c.safetyRank === "ACCEPTABLE_WITH_CAUTION",
  );

  let recommendedExistingPilot: Phase5GRecommendedExistingPilot | null = null;
  if (safePilotCandidates.length > 0) {
    const best = safePilotCandidates[0]!;
    recommendedExistingPilot = {
      driverId: best.driverId,
      currentState: best.currentState,
      action: best.action,
      plannedState: best.plannedState,
      syntheticEvidenceKind: best.syntheticEvidenceKind,
      activeTrip: false,
      financeImpact: "none",
      authImpact: "none",
      safetyRank: "SAFE",
    };
  }

  return {
    scannedCount: bounded.length,
    syntheticDriversFound: inventory.length,
    inventory,
    stateDistribution,
    safePilotCandidates,
    cautionPilotCandidates,
    recommendedExistingPilot,
    recommendation: recommendedExistingPilot
      ? "USE_EXISTING_SYNTHETIC_PILOT"
      : "PREPARE_DEDICATED_SYNTHETIC_PRODUCTION_FIXTURE",
    createFixture: false,
  };
}
