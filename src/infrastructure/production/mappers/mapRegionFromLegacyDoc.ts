/**
 * Map Legacy `cities/{id}` → CanonicalRegionReadModel.
 * Country from `dolh` DocumentReference — never fabricate region/country.
 */

import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import type {
  CanonicalRegionReadModel,
  RegionActiveStatus,
  RegionMappingStatus,
} from "@/domain/geography/CanonicalRegionReadModel";
import { LEGACY_MAPPING_VERSION } from "@/domain/production-read/constants";
import { summarizeCityImage } from "@/domain/geography/CityImageSummary";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseI18n(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const t = str(v);
    if (t) out[k] = t;
  }
  return out;
}

function activeFrom(data: Record<string, unknown>): RegionActiveStatus {
  if (typeof data.acctev === "boolean") return data.acctev ? "active" : "inactive";
  if (typeof data.actev === "boolean") return data.actev ? "active" : "inactive";
  return "unknown";
}

export function mapRegionFromLegacyDoc(input: {
  documentId: string;
  data: Record<string, unknown>;
}): CanonicalRegionReadModel {
  const warnings: string[] = [];
  const names = parseI18n(input.data.names_i18n);
  const naim = str(input.data.naim);
  const nameAr = names.ar ?? names.AR ?? null;
  const nameEn = names.en ?? names.EN ?? null;
  const safeName = nameEn ?? nameAr ?? naim ?? input.documentId;
  const countryId = extractLegacyDocRefId(input.data.dolh);
  let mappingStatus: RegionMappingStatus = "validMapped";

  if (!naim && !nameAr && !nameEn) {
    mappingStatus = "malformed";
    warnings.push("missing_region_name");
  } else if (!countryId) {
    mappingStatus = "unmappedCountry";
    warnings.push("unmapped_country");
  }

  const idLower = input.documentId.toLowerCase();
  if (
    idLower.includes("test_") ||
    idLower.includes("cp5") ||
    idLower.includes("fixture")
  ) {
    mappingStatus = "testOrNoncanonical";
    warnings.push("test_or_noncanonical_region");
  }

  const sortingRaw = input.data.sorting;
  const sorting =
    typeof sortingRaw === "number" && Number.isFinite(sortingRaw)
      ? sortingRaw
      : null;

  const imgSummary = summarizeCityImage(input.data);

  return {
    id: input.documentId,
    sourceDocumentId: input.documentId,
    canonicalRegionId: input.documentId,
    safeName,
    nameAr,
    nameEn,
    countryId,
    activeStatus: activeFrom(input.data),
    mappingStatus,
    sorting,
    imagePresence: imgSummary.hasImage ? "present" : "missing",
    imageStorageKind: imgSummary.hasImage ? imgSummary.storageKind : null,
    source: "legacy_cities_regions",
    warnings,
    mappingVersion: LEGACY_MAPPING_VERSION,
  };
}
