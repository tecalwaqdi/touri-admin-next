/**
 * Phase 5G — proven synthetic evidence for inventory entry.
 * Reuses Phase 5F strict markers. No fuzzy display_name / email / phone.
 * Never reclassifies excludedUnknownIdentity as synthetic.
 */

import {
  classifyProvenSyntheticDriver,
  type ProvenSyntheticMarkerKind,
} from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";

export type Phase5GSyntheticEvidenceKind = ProvenSyntheticMarkerKind;

export type Phase5GSyntheticEvidenceResult = {
  ok: boolean;
  /** Primary kind for inventory (first matched, deterministic order). */
  syntheticEvidenceKind: Phase5GSyntheticEvidenceKind | null;
  markersMatched: readonly Phase5GSyntheticEvidenceKind[];
  fuzzyNameMatchingUsed: false;
  /** Explicit: excludedUnknownIdentity must never enter inventory as synthetic. */
  excludedUnknownIdentityReclassified: false;
  code?: "NOT_PROVEN_SYNTHETIC" | "EXCLUDED_UNKNOWN_IDENTITY_FORBIDDEN";
  message: string;
};

const KIND_PRIORITY: readonly Phase5GSyntheticEvidenceKind[] = [
  "documentId_prefix",
  "is_test",
  "functional_test",
  "demo",
  "qa_fixture",
] as const;

/**
 * Proven synthetic gate for Phase 5G inventory.
 * `existing testOrNoncanonical` is accepted only when backed by the same strict
 * markers (id prefix / boolean flags) — never by fuzzy name/email heuristics.
 */
export function classifyPhase5GSyntheticEvidence(input: {
  documentId: string;
  data?: Record<string, unknown>;
  /** If caller already knows mappingStatus === excludedUnknownIdentity. */
  mappingStatus?: string | null;
}): Phase5GSyntheticEvidenceResult {
  if (input.mappingStatus === "excludedUnknownIdentity") {
    return {
      ok: false,
      syntheticEvidenceKind: null,
      markersMatched: [],
      fuzzyNameMatchingUsed: false,
      excludedUnknownIdentityReclassified: false,
      code: "EXCLUDED_UNKNOWN_IDENTITY_FORBIDDEN",
      message:
        "excludedUnknownIdentity must not be reclassified as synthetic Pilot target",
    };
  }

  const base = classifyProvenSyntheticDriver({
    documentId: input.documentId,
    data: input.data,
  });

  if (!base.ok) {
    return {
      ok: false,
      syntheticEvidenceKind: null,
      markersMatched: [],
      fuzzyNameMatchingUsed: false,
      excludedUnknownIdentityReclassified: false,
      code: "NOT_PROVEN_SYNTHETIC",
      message: base.message,
    };
  }

  const ordered = KIND_PRIORITY.filter((k) =>
    base.markersMatched.includes(k),
  );
  return {
    ok: true,
    syntheticEvidenceKind: ordered[0] ?? base.markersMatched[0]!,
    markersMatched: ordered.length > 0 ? ordered : base.markersMatched,
    fuzzyNameMatchingUsed: false,
    excludedUnknownIdentityReclassified: false,
    message: "Proven synthetic markers matched (no fuzzy name matching)",
  };
}
