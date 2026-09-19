/**
 * Phase 4A-2 — deterministic Production city (Legacy villages) record classification.
 *
 * Authoritative Legacy city collection is `villages` (Admin/Customer/Driver agree).
 * Firestore `cities` holds regions — not product cities.
 *
 * CP5-associated cities (dolh → cp5_country_*, or functional_test markers) →
 * test_or_noncanonical. Never map CP5 country to a valid production country.
 */

export type CityMappingStatus =
  | "validMapped"
  | "unmappedCountry"
  | "ambiguousCountry"
  | "malformed"
  | "testOrNoncanonical";

export type CityRecordClassification =
  | "valid_candidate"
  | "test_or_noncanonical"
  | "malformed";

export type CityRecordClassificationResult = {
  classification: CityRecordClassification;
  reasons: string[];
};

const CP5_COUNTRY_ID = /^cp5_country_\d+$/;
const CP5_CITY_ID = /^cp5_(city|village|vill)_/i;
const FUNCTIONAL_TEST_NAME = "FUNCTIONAL TEST";

function safeStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Extract Legacy DocumentReference id from Admin SDK refs, path strings, or Fake seeds.
 * Never invents identity from display name.
 */
export function extractLegacyDocRefId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const parts = t.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    // Undecoded Firestore REST DocumentReference
    if (typeof o.referenceValue === "string" && o.referenceValue.trim()) {
      return extractLegacyDocRefId(o.referenceValue);
    }
    if (typeof o.id === "string" && o.id.trim()) {
      return o.id.trim();
    }
    if (typeof o.path === "string" && o.path.trim()) {
      const parts = o.path.trim().split("/").filter(Boolean);
      return parts[parts.length - 1] ?? null;
    }
    // firebase-admin DocumentReference-like
    const pathGetter = (o as { path?: unknown }).path;
    if (typeof pathGetter === "string" && pathGetter.trim()) {
      const parts = pathGetter.trim().split("/").filter(Boolean);
      return parts[parts.length - 1] ?? null;
    }
  }
  return null;
}

/**
 * Classify a Legacy/Production villages/{id} document before country mapping.
 */
export function classifyLegacyCityRecord(input: {
  documentId: string;
  data: Record<string, unknown> | null | undefined;
  /** Country document id extracted from dolh (may be null). */
  countryDocId?: string | null;
}): CityRecordClassificationResult {
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
  const countryId = input.countryDocId?.trim() ?? null;

  if (CP5_CITY_ID.test(id)) {
    reasons.push("cp5_city_id_pattern");
  }
  if (countryId && CP5_COUNTRY_ID.test(countryId)) {
    reasons.push("cp5_country_relation");
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

  if (reasons.length > 0) {
    return { classification: "test_or_noncanonical", reasons };
  }

  return { classification: "valid_candidate", reasons: [] };
}
