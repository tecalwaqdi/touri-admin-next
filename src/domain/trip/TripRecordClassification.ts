/**
 * Phase 4A-4 — Trip (Legacy order) record classification.
 * Test/CP5/golden_cycle fixtures → testOrNoncanonical (never delete).
 */

export type TripMappingStatus =
  | "validMapped"
  | "unmappedCountry"
  | "unmappedCity"
  | "unmappedStatus"
  | "ambiguousCountry"
  | "ambiguousCity"
  | "malformed"
  | "testOrNoncanonical";

export type TripRecordClassification =
  | "valid_candidate"
  | "test_or_noncanonical"
  | "malformed";

export type TripRecordClassificationResult = {
  classification: TripRecordClassification;
  reasons: string[];
};

const CP5_ORDER = /^cp5_(order|booking|trip)_/i;
const GOLDEN = /golden_cycle/i;
const FUNCTIONAL = /FUNCTIONAL\s*TEST/i;

export function classifyLegacyTripRecord(input: {
  documentId: string;
  data: Record<string, unknown> | null | undefined;
  countryDocId?: string | null;
  cityDocId?: string | null;
}): TripRecordClassificationResult {
  const id = input.documentId?.trim() ?? "";
  if (!id) {
    return { classification: "malformed", reasons: ["missing_document_id"] };
  }
  if (input.data == null || typeof input.data !== "object") {
    return { classification: "malformed", reasons: ["missing_document_data"] };
  }

  const reasons: string[] = [];
  if (CP5_ORDER.test(id) || /^cp5_/i.test(id)) {
    reasons.push("cp5_order_id");
  }
  if (input.countryDocId && /^cp5_country_/i.test(input.countryDocId)) {
    reasons.push("cp5_country_relation");
  }
  if (input.cityDocId && /^cp5_(city|village|vill)_/i.test(input.cityDocId)) {
    reasons.push("cp5_city_relation");
  }
  if (input.data.golden_cycle != null || input.data.goldenCycle != null) {
    reasons.push("golden_cycle_marker");
  }
  if (input.data.legacy_geo_shadow === true) {
    reasons.push("legacy_geo_shadow");
  }
  if (input.data.functional_test === true) {
    reasons.push("functional_test");
  }
  const nameLike = [
    input.data.naim_user_text,
    input.data.IDorder,
    input.data.test_marker,
  ]
    .map((v) => (typeof v === "string" ? v : ""))
    .join(" ");
  if (FUNCTIONAL.test(nameLike) || GOLDEN.test(nameLike)) {
    reasons.push("functional_or_golden_name");
  }

  if (reasons.length) {
    return { classification: "test_or_noncanonical", reasons };
  }
  return { classification: "valid_candidate", reasons: [] };
}
