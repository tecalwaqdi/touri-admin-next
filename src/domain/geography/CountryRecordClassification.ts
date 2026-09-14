/**
 * Phase 4A-1 — deterministic Production country record classification.
 *
 * Evidence (Legacy READ-ONLY):
 * - ara_oatan_app/firebase/functions/scripts/checkpoint5_admin_az_e2e.js
 *   creates `cp5_country_${stamp}` with naim/name "FUNCTIONAL TEST COUNTRY",
 *   functional_test=true, functional_test_checkpoint='ADMIN_CP5'.
 *
 * Do NOT create canonical aliases for test fixtures.
 */

export type CountryRecordClassification =
  | "valid_candidate"
  | "test_or_noncanonical"
  | "malformed";

export type CountryRecordClassificationResult = {
  classification: CountryRecordClassification;
  reasons: string[];
};

const CP5_COUNTRY_ID = /^cp5_country_\d+$/;
const FUNCTIONAL_TEST_NAME = "FUNCTIONAL TEST COUNTRY";

function safeStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Classify a Legacy/Production countries/{id} document without mapping it.
 * Test fixtures are reported, never silently dropped and never aliased.
 */
export function classifyLegacyCountryRecord(input: {
  documentId: string;
  data: Record<string, unknown> | null | undefined;
}): CountryRecordClassificationResult {
  const id = input.documentId?.trim() ?? "";
  if (!id) {
    return { classification: "malformed", reasons: ["missing_document_id"] };
  }
  if (input.data == null || typeof input.data !== "object") {
    return { classification: "malformed", reasons: ["missing_document_data"] };
  }

  const reasons: string[] = [];
  const naim = safeStr(input.data.naim);
  const name = safeStr(input.data.name);
  const display = name ?? naim;
  const functionalTest = input.data.functional_test === true;
  const checkpoint = safeStr(input.data.functional_test_checkpoint);

  if (CP5_COUNTRY_ID.test(id)) {
    reasons.push("cp5_country_id_pattern");
  }
  if (functionalTest && checkpoint === "ADMIN_CP5") {
    reasons.push("functional_test_checkpoint_admin_cp5");
  }
  if (
    functionalTest &&
    display?.toUpperCase() === FUNCTIONAL_TEST_NAME
  ) {
    reasons.push("functional_test_name_marker");
  }
  if (
    id.startsWith("cp5_country_") &&
    display?.toUpperCase() === FUNCTIONAL_TEST_NAME
  ) {
    reasons.push("cp5_prefix_plus_functional_test_name");
  }

  if (reasons.length > 0) {
    return { classification: "test_or_noncanonical", reasons };
  }

  return { classification: "valid_candidate", reasons: [] };
}
