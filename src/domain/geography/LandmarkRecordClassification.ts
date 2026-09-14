/**
 * Phase 4A-3 — deterministic Production landmark (Legacy `mkan`) classification.
 *
 * Authoritative Legacy landmark collection is `mkan` (Admin / Customer / Driver /
 * Functions / geo_import agree). Product city = `id_vill` → villages/{id};
 * country = `Rev_dolh` → countries/{id}; region = `id_cit` → cities/{id}.
 *
 * CP5 / functional_test / checkpoint markers → testOrNoncanonical. Never delete.
 */

export type LandmarkMappingStatus =
  | "validMapped"
  | "unmappedCountry"
  | "unmappedCity"
  | "ambiguousCountry"
  | "ambiguousCity"
  | "malformed"
  | "testOrNoncanonical";

export type LandmarkRecordClassification =
  | "valid_candidate"
  | "test_or_noncanonical"
  | "malformed";

export type LandmarkRecordClassificationResult = {
  classification: LandmarkRecordClassification;
  reasons: string[];
};

const CP5_COUNTRY_ID = /^cp5_country_\d+$/;
const CP5_CITY_ID = /^cp5_(city|village|vill)_/i;
const CP5_LANDMARK_ID = /^cp5_(mkan|landmark|place)_/i;
const FUNCTIONAL_TEST_NAME = "FUNCTIONAL TEST";
const CHECKPOINT_MARKERS = /checkpoint|cp5|e2e|seed_demo|shadow_compat|functional[_\s-]?test/i;

function safeStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Classify a Legacy/Production mkan/{id} document before country/city mapping.
 */
export function classifyLegacyLandmarkRecord(input: {
  documentId: string;
  data: Record<string, unknown> | null | undefined;
  /** Country document id extracted from Rev_dolh (may be null). */
  countryDocId?: string | null;
  /** City (villages) document id extracted from id_vill (may be null). */
  cityDocId?: string | null;
}): LandmarkRecordClassificationResult {
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
  const geoImportSource = safeStr(input.data.geo_import_source);
  const countryId = input.countryDocId?.trim() ?? null;
  const cityId = input.cityDocId?.trim() ?? null;

  if (CP5_LANDMARK_ID.test(id)) {
    reasons.push("cp5_landmark_id_pattern");
  }
  if (CHECKPOINT_MARKERS.test(id)) {
    reasons.push("checkpoint_or_test_id_pattern");
  }
  if (countryId && CP5_COUNTRY_ID.test(countryId)) {
    reasons.push("cp5_country_relation");
  }
  if (cityId && CP5_CITY_ID.test(cityId)) {
    reasons.push("cp5_city_relation");
  }
  if (functionalTest && checkpoint === "ADMIN_CP5") {
    reasons.push("functional_test_checkpoint_admin_cp5");
  }
  if (
    functionalTest &&
    display?.toUpperCase().includes(FUNCTIONAL_TEST_NAME)
  ) {
    reasons.push("functional_test_name_marker");
  }
  if (display?.toUpperCase().includes(FUNCTIONAL_TEST_NAME)) {
    reasons.push("functional_test_display_name");
  }
  if (
    geoImportSource &&
    /shadow|compat|e2e|checkpoint/i.test(geoImportSource)
  ) {
    reasons.push("geo_import_test_source_marker");
  }
  if (input.data.legacy_geo_shadow === true) {
    reasons.push("legacy_geo_shadow_marker");
  }

  if (reasons.length > 0) {
    return { classification: "test_or_noncanonical", reasons };
  }

  return { classification: "valid_candidate", reasons: [] };
}
