/**
 * Phase 4A-3 — safe live-window landmark mapping diagnostics + closing gates.
 * Never includes image URLs, contacts, raw docs, tokens, or credentials.
 */

import type {
  LandmarkActiveStatus,
  LandmarkMappingStatus,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";

export type LandmarkCountryMappingDiag =
  | "mapped"
  | "unmapped"
  | "missing"
  | "testOrNoncanonical"
  | "malformed";

export type LandmarkCityMappingDiag =
  | "present"
  | "missing"
  | "ambiguous"
  | "testOrNoncanonical";

export type LandmarkRegionMappingDiag = "present" | "missing";

export type UnmappedLandmarkSafeDiagnostic = {
  sourceDocumentId: string;
  safeName: string;
  /** Actual Rev_dolh path when present — never inferred replacement. */
  sourceCountryReferencePath: string | null;
  /** Actual id_vill path when present. */
  sourceCityReferencePath: string | null;
  /** Actual id_cit path when present. */
  sourceRegionReferencePath: string | null;
  activeStatus: LandmarkActiveStatus;
  mappingStatus: LandmarkMappingStatus;
  countryMapping: LandmarkCountryMappingDiag;
  cityMapping: LandmarkCityMappingDiag;
  regionMapping: LandmarkRegionMappingDiag;
};

export type LandmarkLiveClosingStats = {
  unmappedCountry: number;
  unmappedCity: number;
  ambiguousCountry: number;
  ambiguousCity: number;
  malformed: number;
  activeOperationalDuplicates: number;
  productionWriteCalls: number;
  unexpectedCollections: string[];
};

const CP5_CITY_ID = /^cp5_(city|village|vill)_/i;

/**
 * Closing gates for Phase 4A-3 live landmarks window.
 * Do not weaken — mapping_failure unmapped_country must fail close.
 */
export function landmarkLiveClosingGatesPass(
  stats: LandmarkLiveClosingStats,
): boolean {
  return (
    stats.unmappedCountry === 0 &&
    stats.unmappedCity === 0 &&
    stats.ambiguousCountry === 0 &&
    stats.ambiguousCity === 0 &&
    stats.malformed === 0 &&
    stats.activeOperationalDuplicates === 0 &&
    stats.productionWriteCalls === 0 &&
    stats.unexpectedCollections.length === 0
  );
}

/** Reconstruct safe collection path from extracted id — never invents identity. */
export function landmarkRelationReferencePath(
  collection: "countries" | "villages" | "cities",
  documentId: string | null | undefined,
): string | null {
  const id = documentId?.trim() ?? "";
  if (!id) return null;
  return `${collection}/${id}`;
}

/**
 * Independent country/city/region mapping assessment for diagnostics.
 * Country failure must not hide city/region presence.
 */
export function assessLandmarkRelationMappings(input: {
  countryId: string;
  cityId: string;
  regionId: string | null;
  mappingStatus: LandmarkMappingStatus;
  warnings: string[];
}): {
  countryMapping: LandmarkCountryMappingDiag;
  cityMapping: LandmarkCityMappingDiag;
  regionMapping: LandmarkRegionMappingDiag;
} {
  const warnings = new Set(input.warnings);
  let countryMapping: LandmarkCountryMappingDiag;

  if (input.mappingStatus === "malformed") {
    countryMapping = "malformed";
  } else if (
    input.mappingStatus === "testOrNoncanonical" ||
    warnings.has("test_or_noncanonical_country_relation")
  ) {
    countryMapping = "testOrNoncanonical";
  } else if (
    warnings.has("missing_country_relation") ||
    !input.countryId.trim()
  ) {
    countryMapping = "missing";
  } else if (
    warnings.has("unmapped_country") ||
    input.mappingStatus === "unmappedCountry"
  ) {
    const resolved = resolveCanonicalCountryId(input.countryId);
    countryMapping = resolved.status === "mapped" ? "mapped" : "unmapped";
  } else if (input.mappingStatus === "ambiguousCountry") {
    countryMapping = "unmapped";
  } else {
    const resolved = resolveCanonicalCountryId(input.countryId);
    countryMapping = resolved.status === "mapped" ? "mapped" : "unmapped";
  }

  let cityMapping: LandmarkCityMappingDiag;
  if (
    warnings.has("test_or_noncanonical_city_relation") ||
    CP5_CITY_ID.test(input.cityId)
  ) {
    cityMapping = "testOrNoncanonical";
  } else if (
    warnings.has("missing_city_relation") ||
    !input.cityId.trim()
  ) {
    cityMapping = "missing";
  } else if (
    warnings.has("ambiguous_city_guard") ||
    warnings.has("AMBIGUOUS_CITY") ||
    input.mappingStatus === "ambiguousCity"
  ) {
    cityMapping = "ambiguous";
  } else {
    // Phase 4A-2 pattern: villages/{id} document id is identity (soft alias).
    cityMapping = "present";
  }

  const regionMapping: LandmarkRegionMappingDiag =
    input.regionId != null && input.regionId.trim().length > 0
      ? "present"
      : "missing";

  return { countryMapping, cityMapping, regionMapping };
}

export function buildUnmappedLandmarkSafeDiagnostic(input: {
  sourceDocumentId: string;
  safeName: string;
  countryId: string;
  /** Raw Rev_dolh document id when known — preferred over resolved countryId for path. */
  sourceCountryDocumentId?: string;
  cityId: string;
  regionId: string | null;
  activeStatus: LandmarkActiveStatus;
  mappingStatus: LandmarkMappingStatus;
  warnings: string[];
}): UnmappedLandmarkSafeDiagnostic {
  const relations = assessLandmarkRelationMappings(input);
  const sourceCountryId =
    input.sourceCountryDocumentId?.trim() || input.countryId || null;
  return {
    sourceDocumentId: input.sourceDocumentId,
    safeName: input.safeName,
    sourceCountryReferencePath: landmarkRelationReferencePath(
      "countries",
      sourceCountryId,
    ),
    sourceCityReferencePath: landmarkRelationReferencePath(
      "villages",
      input.cityId || null,
    ),
    sourceRegionReferencePath: landmarkRelationReferencePath(
      "cities",
      input.regionId,
    ),
    activeStatus: input.activeStatus,
    mappingStatus: input.mappingStatus,
    countryMapping: relations.countryMapping,
    cityMapping: relations.cityMapping,
    regionMapping: relations.regionMapping,
  };
}

/** True when report JSON must not contain sensitive landmark payloads. */
export function landmarkLiveReportHasSensitiveLeak(serialized: string): boolean {
  return (
    /firebasestorage\.googleapis\.com/i.test(serialized) ||
    /Bearer\s+\S+/i.test(serialized) ||
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(serialized) ||
    /BEGIN (RSA )?PRIVATE KEY/i.test(serialized) ||
    /EmailUser/i.test(serialized)
  );
}

export function formatLandmarkMappingNoGoMessage(
  diagnostics: UnmappedLandmarkSafeDiagnostic[],
): string {
  const parts = diagnostics.map((d) => {
    const country = d.sourceCountryReferencePath ?? "(missing Rev_dolh)";
    const city = d.sourceCityReferencePath ?? "(missing id_vill)";
    return `${d.sourceDocumentId} status=${d.mappingStatus} country=${country} city=${city} countryMapping=${d.countryMapping} cityMapping=${d.cityMapping}`;
  });
  return `NO-GO: landmark mapping gate failed — ${parts.join("; ") || "blocking mapping stats"}`;
}
