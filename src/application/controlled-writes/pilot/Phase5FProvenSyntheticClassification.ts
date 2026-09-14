/**
 * Phase 5F — proven synthetic/test classification (STRICT).
 * No fuzzy display-name / email heuristics. No invented markers.
 *
 * Permitted evidence only:
 * - document-id prefixes: cp5_ | test_ | demo_ | golden_ | qa_
 * - boolean markers: is_test | functional_test | demo | qa_fixture
 */

export const PHASE_5F_SYNTHETIC_DOCUMENT_ID_PREFIX_RE =
  /^cp5_|^test_|^demo_|^golden_|^qa_/i;

export type ProvenSyntheticMarkerKind =
  | "documentId_prefix"
  | "is_test"
  | "functional_test"
  | "demo"
  | "qa_fixture";

export type ProvenSyntheticClassification = {
  ok: boolean;
  markersMatched: readonly ProvenSyntheticMarkerKind[];
  /** Explicitly rejected fuzzy name/email matching. */
  fuzzyNameMatchingUsed: false;
  code?: "NOT_PROVEN_SYNTHETIC";
  message: string;
};

/**
 * Strict synthetic gate for Pilot target discovery.
 * Does NOT use display_name / email "looks fake" heuristics.
 */
export function classifyProvenSyntheticDriver(input: {
  documentId: string;
  data?: Record<string, unknown>;
}): ProvenSyntheticClassification {
  const id = input.documentId.trim();
  const data = input.data ?? {};
  const matched: ProvenSyntheticMarkerKind[] = [];

  if (!id) {
    return {
      ok: false,
      markersMatched: [],
      fuzzyNameMatchingUsed: false,
      code: "NOT_PROVEN_SYNTHETIC",
      message: "documentId required for proven synthetic classification",
    };
  }

  if (PHASE_5F_SYNTHETIC_DOCUMENT_ID_PREFIX_RE.test(id)) {
    matched.push("documentId_prefix");
  }
  if (data.is_test === true || data.is_test === "true") {
    matched.push("is_test");
  }
  if (data.functional_test === true || data.functional_test === "true") {
    matched.push("functional_test");
  }
  if (data.demo === true || data.demo === "true") {
    matched.push("demo");
  }
  if (data.qa_fixture === true || data.qa_fixture === "true") {
    matched.push("qa_fixture");
  }

  if (matched.length === 0) {
    return {
      ok: false,
      markersMatched: [],
      fuzzyNameMatchingUsed: false,
      code: "NOT_PROVEN_SYNTHETIC",
      message:
        "No proven synthetic marker (id prefix / is_test / functional_test / demo / qa_fixture)",
    };
  }

  return {
    ok: true,
    markersMatched: matched,
    fuzzyNameMatchingUsed: false,
    message: "Proven synthetic markers matched (no fuzzy name matching)",
  };
}

/**
 * Planned Phase 5E strategy id — INVALID as a Production target unless the
 * document actually exists in the discovered candidate set and validates.
 */
export const PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET =
  "test_phase5e_driver_needs_changes_pilot_001" as const;
