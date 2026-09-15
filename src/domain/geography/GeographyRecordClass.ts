/**
 * Geography record class for QA / pilot / legacy (PC-6).
 * Uses contractual ID patterns + metadata — not unsafe prefix-only alone.
 */

import { looksLikePilotOrTestDocumentId } from "@/domain/production-read/SourceLabel";
import { classifyLegacyCountryRecord } from "@/domain/geography/CountryRecordClassification";
import { classifyLegacyCityRecord } from "@/domain/geography/CityRecordClassification";
import { classifyLegacyLandmarkRecord } from "@/domain/geography/LandmarkRecordClassification";
import {
  isLegacyAfricaCompatCityId,
  isLegacyIntlAliasCityId,
} from "@/domain/geography/CityDuplicateIdentityAudit";

export type GeographyRecordClass =
  | "production"
  | "production_pilot"
  | "legacy"
  | "qa"
  | "unknown";

export type GeographyRecordClassResult = {
  recordClass: GeographyRecordClass;
  reasons: string[];
};

function hasExplicitTestMetadata(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  if (data.functional_test === true) return true;
  if (data.is_test === true) return true;
  if (data.qa_fixture === true) return true;
  if (data.demo === true) return true;
  if (data.legacy_geo_shadow === true) return true;
  const checkpoint = typeof data.functional_test_checkpoint === "string"
    ? data.functional_test_checkpoint
    : "";
  if (checkpoint) return true;
  const geoImport =
    typeof data.geo_import_source === "string" ? data.geo_import_source : "";
  if (/shadow|compat|e2e|checkpoint|qa|pilot/i.test(geoImport)) return true;
  return false;
}

/**
 * Classify a geography document with reliable evidence.
 * Prefix alone is insufficient unless already contractual (cp5_/pilot_/test_adminnext_).
 */
export function classifyGeographyRecordClass(input: {
  entityKind: "country" | "city" | "landmark";
  documentId: string;
  data?: Record<string, unknown> | null;
  mappingStatus?: string | null;
  countryDocId?: string | null;
  cityDocId?: string | null;
}): GeographyRecordClassResult {
  const id = input.documentId.trim();
  const reasons: string[] = [];
  const data = input.data ?? null;
  const explicitMeta = hasExplicitTestMetadata(data);

  if (input.entityKind === "country") {
    const classified = classifyLegacyCountryRecord({
      documentId: id,
      data: data ?? { naim: id },
    });
    if (classified.classification === "test_or_noncanonical") {
      reasons.push(...classified.reasons);
      if (id.startsWith("qa_") || /qa_fixture/i.test(JSON.stringify(data ?? {}))) {
        return { recordClass: "qa", reasons };
      }
      if (looksLikePilotOrTestDocumentId(id) || explicitMeta) {
        return { recordClass: "production_pilot", reasons };
      }
      return { recordClass: "legacy", reasons };
    }
  }

  if (input.entityKind === "city") {
    const classified = classifyLegacyCityRecord({
      documentId: id,
      data: data ?? { naim: id },
      countryDocId: input.countryDocId,
    });
    if (classified.classification === "test_or_noncanonical") {
      reasons.push(...classified.reasons);
      if (id.startsWith("qa_") || explicitMeta) {
        return {
          recordClass: id.startsWith("qa_") ? "qa" : "production_pilot",
          reasons,
        };
      }
      return { recordClass: "legacy", reasons };
    }
    if (isLegacyIntlAliasCityId(id) || isLegacyAfricaCompatCityId(id)) {
      reasons.push("legacy_compat_city_id_pattern");
      return { recordClass: "legacy", reasons };
    }
  }

  if (input.entityKind === "landmark") {
    const classified = classifyLegacyLandmarkRecord({
      documentId: id,
      data: data ?? { naim: id },
      countryDocId: input.countryDocId,
      cityDocId: input.cityDocId,
    });
    if (classified.classification === "test_or_noncanonical") {
      reasons.push(...classified.reasons);
      if (id.startsWith("qa_") || explicitMeta) {
        return {
          recordClass: id.startsWith("qa_") ? "qa" : "production_pilot",
          reasons,
        };
      }
      return { recordClass: "legacy", reasons };
    }
  }

  if (input.mappingStatus === "testOrNoncanonical") {
    reasons.push("mapping_status_test_or_noncanonical");
    return { recordClass: "production_pilot", reasons };
  }

  // Contractual pilot id patterns (SourceLabel) — only with mapping/meta corroboration
  // OR explicit SourceLabel contractual regex (already used for finance pilots).
  if (looksLikePilotOrTestDocumentId(id) && explicitMeta) {
    reasons.push("pilot_id_and_explicit_metadata");
    return { recordClass: "production_pilot", reasons };
  }

  if (looksLikePilotOrTestDocumentId(id) && !explicitMeta) {
    // Prefix alone without metadata → unknown (not unsafe exclusion).
    reasons.push("pilot_like_id_without_metadata");
    return { recordClass: "unknown", reasons };
  }

  if (!id) {
    return { recordClass: "unknown", reasons: ["missing_document_id"] };
  }

  return { recordClass: "production", reasons: [] };
}
