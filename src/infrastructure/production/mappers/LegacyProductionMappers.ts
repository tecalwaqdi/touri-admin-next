/**
 * Phase 4A-0 — Legacy → Canonical mappers for Production shadow reads.
 * Incomplete ≠ zero. Unknown status → unmapped warning. No auto-pick cities.
 */

import {
  LEGACY_MAPPING_VERSION,
  SOURCE_SCHEMA_VERSION_UNKNOWN,
} from "@/domain/production-read/constants";
import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";
import type {
  CanonicalAgentReadModel,
  CanonicalCustomerReadModel,
  CanonicalDriverReadModel,
  CanonicalTripReadModel,
  Provenanced,
} from "@/domain/canonical/CanonicalReadModels";
import { mapCanonicalDriverFromLegacyDoc } from "@/domain/driver/mapCanonicalDriverRead";
import { mapCanonicalAgentFromLegacyDoc } from "@/domain/agent/mapCanonicalAgentRead";
import { mapCanonicalCustomerFromLegacyDoc } from "@/domain/customer/mapCanonicalCustomerRead";
import {
  resolveCityId,
  type CityAliasEntry,
} from "@/domain/geography/CityAliasResolver";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import {
  classifyLegacyCountryRecord,
  type CountryRecordClassification,
} from "@/domain/geography/CountryRecordClassification";
import {
  classifyLegacyCityRecord,
  extractLegacyDocRefId,
  type CityMappingStatus,
} from "@/domain/geography/CityRecordClassification";
import {
  classifyLegacyLandmarkRecord,
  type LandmarkMappingStatus,
} from "@/domain/geography/LandmarkRecordClassification";
import {
  summarizeLandmarkImages,
  extractLandmarkImagePreviewUrl,
  type LandmarkImageSummary,
} from "@/domain/geography/LandmarkImageSummary";
import { summarizeCityImage } from "@/domain/geography/CityImageSummary";
import { mapCanonicalTripFromLegacyDoc } from "@/domain/trip/mapCanonicalTripRead";
import type {
  LegacyAgentMapper,
  LegacyCustomerSummaryMapper,
  LegacyDriverMapper,
  LegacyTripMapper,
  MappedReadResult,
  MappingWarning,
} from "@/infrastructure/production/contracts/LegacyMappers";
import type {
  CityActiveStatus,
  LandmarkActiveStatus,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type {
  ProductionAgentSourceRecord,
  ProductionCustomerSummarySourceRecord,
  ProductionDriverSourceRecord,
  ProductionTripSourceRecord,
} from "@/infrastructure/production/contracts/ProductionSourceRecords";
import { projectAllowedFields } from "@/infrastructure/production/contracts/FieldAllowlist";
import { decideFieldAllow } from "@/infrastructure/production/contracts/FieldAllowlist";


function proven<T>(
  value: T | null,
  source: {
    collection: string;
    documentId: string;
    field: string | null;
    sourceValue: unknown;
    confidence?: MappingConfidence;
    warnings?: string[];
  },
): Provenanced<T> {
  return {
    value,
    provenance: {
      sourceSystem: "legacy",
      sourceCollection: source.collection,
      sourceDocumentId: source.documentId,
      sourceField: source.field,
      sourceValue: source.sourceValue as T | null,
      mappingConfidence: source.confidence ?? (value == null ? "unknown" : "medium"),
      mappingVersion: LEGACY_MAPPING_VERSION,
      warnings: source.warnings ?? [],
      availabilityStatus: value == null ? "missing" : "available",
    },
  };
}

export class DefaultLegacyTripMapper implements LegacyTripMapper {
  map(source: ProductionTripSourceRecord): MappedReadResult<CanonicalTripReadModel> {
    const raw = projectAllowedFields(source.raw).data as Record<string, unknown>;
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: source.sourceDocumentId,
      data: { ...source.raw, ...raw },
    });

    // Financial DO_NOT_EXPOSE fields — detect on original raw (allowlist may strip).
    for (const f of [
      "refundAmount",
      "chargebackAmount",
      "gatewayFee",
      "adjustmentAmount",
    ]) {
      if (f in source.raw && decideFieldAllow(f).allow === false) {
        if (!mapped.mappingWarnings.some((w) => w.field === f)) {
          mapped.mappingWarnings.push({
            code: "financial_field_blocked",
            field: f,
            message: `Blocked financial field ${f}`,
            severity: "info",
          });
        }
      }
    }

    return {
      model: mapped.model,
      mappingWarnings: mapped.mappingWarnings,
      mappingConfidence: mapped.mappingConfidence,
      sourceVersion: source.sourceVersion,
      mappingVersion: LEGACY_MAPPING_VERSION,
      sourceSchemaVersion: source.sourceSchemaVersion || SOURCE_SCHEMA_VERSION_UNKNOWN,
    };
  }
}

export class DefaultLegacyDriverMapper implements LegacyDriverMapper {
  map(
    source: ProductionDriverSourceRecord,
  ): MappedReadResult<CanonicalDriverReadModel> {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: source.sourceDocumentId,
      data: source.raw,
    });
    return {
      model: mapped.model,
      mappingWarnings: mapped.mappingWarnings,
      mappingConfidence: mapped.mappingConfidence,
      sourceVersion: source.sourceVersion,
      mappingVersion: LEGACY_MAPPING_VERSION,
      sourceSchemaVersion:
        source.sourceSchemaVersion || SOURCE_SCHEMA_VERSION_UNKNOWN,
    };
  }
}

export class DefaultLegacyAgentMapper implements LegacyAgentMapper {
  map(
    source: ProductionAgentSourceRecord,
  ): MappedReadResult<CanonicalAgentReadModel> {
    // Phase 4A-6 — evidence-backed mapper (Isagent + Rev_dloh_agent).
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: source.sourceDocumentId,
      data: source.raw,
    });
    const warnings = [...mapped.mappingWarnings];
    if (source.raw.historical_assignment_unknown === true) {
      warnings.push({
        code: "historical_agent_assignment_unknown",
        field: "agentId",
        message: "Historical agent assignment not proven — do not invent",
        severity: "warning",
      });
    }
    return {
      model: mapped.model,
      mappingWarnings: warnings,
      mappingConfidence: mapped.mappingConfidence,
      sourceVersion: source.sourceVersion,
      mappingVersion: LEGACY_MAPPING_VERSION,
      sourceSchemaVersion:
        source.sourceSchemaVersion || SOURCE_SCHEMA_VERSION_UNKNOWN,
    };
  }
}

export class DefaultLegacyCustomerSummaryMapper
  implements LegacyCustomerSummaryMapper
{
  map(
    source: ProductionCustomerSummarySourceRecord,
  ): MappedReadResult<CanonicalCustomerReadModel> {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: source.sourceDocumentId,
      data: source.raw,
    });
    return {
      model: mapped.model,
      mappingWarnings: mapped.mappingWarnings,
      mappingConfidence: mapped.mappingConfidence,
      sourceVersion: source.sourceVersion,
      mappingVersion: LEGACY_MAPPING_VERSION,
      sourceSchemaVersion:
        source.sourceSchemaVersion || SOURCE_SCHEMA_VERSION_UNKNOWN,
    };
  }
}

export type GeographyCountryMapResult = {
  canonicalId: string;
  /** Raw Firestore document id (never invent). */
  sourceDocumentId: string;
  name: string;
  nameAr: string | null;
  nameEn: string | null;
  currencyCode: string | null;
  /** Legacy acctev → active | inactive | unknown. */
  activeStatus: "active" | "inactive" | "unknown";
  /** Legacy countries.img presence. */
  imagePresence: "present" | "missing";
  imageStorageKind: string | null;
  currencySymbol: string | null;
  vatPercent: number | null;
  appCommissionPercent: number | null;
  sortOrder: number | null;
  warnings: MappingWarning[];
  mappingConfidence: MappingConfidence;
  unmapped: boolean;
  /** Deterministic record class — test fixtures are never aliased. */
  recordClassification: CountryRecordClassification;
};

/**
 * Legacy Geography Mapper → Canonical Country Read Model fields.
 * Uses evidence-backed CountryCanonicalization table (no internet guessing).
 * Test/noncanonical fixtures are classified but never given a new alias.
 */
export function mapCountryFromLegacyDoc(input: {
  documentId: string;
  data: Record<string, unknown>;
}): GeographyCountryMapResult {
  const warnings: MappingWarning[] = [];
  const classified = classifyLegacyCountryRecord(input);
  const nameAr = str(input.data.naim);
  const nameEn =
    str(input.data.name) ?? str(input.data.naimEnglesh) ?? null;
  const rawName = nameEn ?? nameAr ?? input.documentId;
  const currencyCode =
    str(input.data.currencyCode) ??
    str(input.data.currency_code) ??
    str(input.data.currency) ??
    null;
  const currencySymbol =
    str(input.data.CurrencySymbol) ?? str(input.data.currency_symbol) ?? null;
  const vatPercent =
    num(input.data.vat_percent) ?? num(input.data.vatPercent) ?? null;
  const appCommissionPercent =
    num(input.data.app_commission_percent) ??
    num(input.data.appCommissionPercent) ??
    null;
  const sortOrder =
    num(input.data.num_trteb) ??
    num(input.data.numTrteb) ??
    num(input.data.sortOrder) ??
    null;
  const activeStatus: GeographyCountryMapResult["activeStatus"] =
    typeof input.data.acctev === "boolean"
      ? input.data.acctev
        ? "active"
        : "inactive"
      : typeof input.data.actev === "boolean"
        ? input.data.actev
          ? "active"
          : "inactive"
        : "unknown";
  const imgSummary = summarizeCityImage(input.data);
  const imagePresence: GeographyCountryMapResult["imagePresence"] =
    imgSummary.hasImage ? "present" : "missing";
  const imageStorageKind = imgSummary.hasImage ? imgSummary.storageKind : null;

  const base = {
    name: rawName,
    nameAr,
    nameEn,
    currencyCode,
    currencySymbol,
    vatPercent,
    appCommissionPercent,
    sortOrder,
    activeStatus,
    imagePresence,
    imageStorageKind,
  };

  if (classified.classification === "malformed") {
    warnings.push({
      code: "malformed_country",
      field: "id",
      message: `Malformed country record: ${classified.reasons.join(",")}`,
      severity: "error",
    });
    return {
      ...base,
      canonicalId: input.documentId,
      sourceDocumentId: input.documentId,
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
      recordClassification: "malformed",
    };
  }

  if (classified.classification === "test_or_noncanonical") {
    warnings.push({
      code: "test_or_noncanonical_country",
      field: "id",
      message: `Test/noncanonical country (not aliased): ${classified.reasons.join(",")}`,
      severity: "warning",
    });
    return {
      ...base,
      canonicalId: input.documentId,
      sourceDocumentId: input.documentId,
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
      recordClassification: "test_or_noncanonical",
    };
  }

  const resolved = resolveCanonicalCountryId(input.documentId);
  const isoHint = str(input.data.iso_code) ?? str(input.data.iso2);
  const resolvedViaIso =
    resolved.status === "unmapped" && isoHint
      ? resolveCanonicalCountryId(isoHint)
      : resolved;

  if (resolvedViaIso.status === "unmapped") {
    warnings.push({
      code: "unmapped_country",
      field: "id",
      message: `Unmapped country: ${input.documentId}`,
      severity: "error",
    });
    return {
      ...base,
      canonicalId: input.documentId,
      sourceDocumentId: input.documentId,
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
      recordClassification: "valid_candidate",
    };
  }

  if (resolvedViaIso.matchedVia === "alias" || resolvedViaIso.matchedVia === "iso2") {
    warnings.push({
      code: "country_alias_resolved",
      field: "id",
      message: `Resolved via ${resolvedViaIso.matchedVia}`,
      severity: "info",
    });
  }

  return {
    ...base,
    canonicalId: resolvedViaIso.canonicalCountryId,
    sourceDocumentId: input.documentId,
    warnings,
    mappingConfidence: resolvedViaIso.confidence,
    unmapped: false,
    recordClassification: "valid_candidate",
  };
}

export type GeographyCityMapResult = {
  cityId: string | null;
  warnings: MappingWarning[];
  ambiguous: boolean;
};

/**
 * Phase 4A-2 — map Legacy villages/{id} → canonical city read fields.
 *
 * Country identity comes ONLY from `dolh` DocumentReference (never from city name).
 * Region identity from optional `cities` DocumentReference (Legacy region parent).
 * Active status from `acctev`. Ordering field for reads is `naim` (Legacy evidence).
 */
export type GeographyCityDocMapResult = {
  /** Canonical identity (alias-resolved). Prefer canonicalCityId in new code. */
  id: string;
  /** Raw Firestore villages document id — never alias-collapsed. */
  sourceDocumentId: string;
  /** Alias-resolved canonical city id (may equal sourceDocumentId). */
  canonicalCityId: string;
  safeName: string;
  nameAr: string | null;
  nameEn: string | null;
  countryId: string;
  regionId: string | null;
  activeStatus: CityActiveStatus;
  mappingStatus: CityMappingStatus;
  source: "legacy_villages";
  warnings: MappingWarning[];
  mappingConfidence: MappingConfidence;
  aliasResolved: boolean;
  unmapped: boolean;
};

function cityMapBase(
  input: { documentId: string },
  fields: Omit<
    GeographyCityDocMapResult,
    "sourceDocumentId" | "canonicalCityId" | "id" | "nameAr" | "nameEn"
  > & {
    canonicalCityId: string;
    nameAr?: string | null;
    nameEn?: string | null;
  },
): GeographyCityDocMapResult {
  return {
    id: fields.canonicalCityId,
    sourceDocumentId: input.documentId,
    canonicalCityId: fields.canonicalCityId,
    safeName: fields.safeName,
    nameAr: fields.nameAr ?? null,
    nameEn: fields.nameEn ?? null,
    countryId: fields.countryId,
    regionId: fields.regionId,
    activeStatus: fields.activeStatus,
    mappingStatus: fields.mappingStatus,
    source: fields.source,
    warnings: fields.warnings,
    mappingConfidence: fields.mappingConfidence,
    aliasResolved: fields.aliasResolved,
    unmapped: fields.unmapped,
  };
}

export function mapCityFromLegacyDoc(input: {
  documentId: string;
  data: Record<string, unknown>;
  aliases?: CityAliasEntry[];
}): GeographyCityDocMapResult {
  const warnings: MappingWarning[] = [];
  const rawCountryId = extractLegacyDocRefId(input.data.dolh);
  const regionId = extractLegacyDocRefId(input.data.cities);
  const nameAr = str(input.data.naim);
  const nameEn = str(input.data.name);
  const safeName = nameAr ?? nameEn ?? input.documentId;

  let activeStatus: CityActiveStatus = "unknown";
  if (typeof input.data.acctev === "boolean") {
    activeStatus = input.data.acctev ? "active" : "inactive";
  }

  const classified = classifyLegacyCityRecord({
    documentId: input.documentId,
    data: input.data,
    countryDocId: rawCountryId,
  });

  if (classified.classification === "malformed") {
    warnings.push({
      code: "malformed_city",
      field: "id",
      message: `Malformed city record: ${classified.reasons.join(",")}`,
      severity: "error",
    });
    return cityMapBase(input, {
      canonicalCityId: input.documentId,
      safeName,
      nameAr,
      nameEn,
      countryId: rawCountryId ?? "",
      regionId,
      activeStatus,
      mappingStatus: "malformed",
      source: "legacy_villages",
      warnings,
      mappingConfidence: "unknown",
      aliasResolved: false,
      unmapped: true,
    });
  }

  if (classified.classification === "test_or_noncanonical") {
    warnings.push({
      code: "test_or_noncanonical_city",
      field: "countryId",
      message: `Test/noncanonical city (not aliased to production country): ${classified.reasons.join(",")}`,
      severity: "warning",
    });
    return cityMapBase(input, {
      canonicalCityId: input.documentId,
      safeName,
      nameAr,
      nameEn,
      countryId: rawCountryId ?? "",
      regionId,
      activeStatus,
      mappingStatus: "testOrNoncanonical",
      source: "legacy_villages",
      warnings,
      mappingConfidence: "unknown",
      aliasResolved: false,
      unmapped: true,
    });
  }

  if (!rawCountryId) {
    warnings.push({
      code: "missing_country_relation",
      field: "dolh",
      message: "City missing dolh country DocumentReference — not inventing from name",
      severity: "error",
    });
    return cityMapBase(input, {
      canonicalCityId: input.documentId,
      safeName,
      nameAr,
      nameEn,
      countryId: "",
      regionId,
      activeStatus,
      mappingStatus: "unmappedCountry",
      source: "legacy_villages",
      warnings,
      mappingConfidence: "unknown",
      aliasResolved: false,
      unmapped: true,
    });
  }

  // If country doc itself is a CP5 fixture id, never promote to validMapped.
  if (classifyLegacyCountryRecord({ documentId: rawCountryId, data: {} }).classification ===
      "test_or_noncanonical" ||
    /^cp5_country_\d+$/.test(rawCountryId)
  ) {
    warnings.push({
      code: "test_or_noncanonical_country_relation",
      field: "dolh",
      message: `City linked to CP5/test country ${rawCountryId}`,
      severity: "warning",
    });
    return cityMapBase(input, {
      canonicalCityId: input.documentId,
      safeName,
      nameAr,
      nameEn,
      countryId: rawCountryId,
      regionId,
      activeStatus,
      mappingStatus: "testOrNoncanonical",
      source: "legacy_villages",
      warnings,
      mappingConfidence: "unknown",
      aliasResolved: false,
      unmapped: true,
    });
  }

  const resolved = resolveCanonicalCountryId(rawCountryId);
  if (resolved.status === "unmapped") {
    warnings.push({
      code: "unmapped_country",
      field: "dolh",
      message: `Unmapped country relation: ${rawCountryId}`,
      severity: "error",
    });
    return cityMapBase(input, {
      canonicalCityId: input.documentId,
      safeName,
      nameAr,
      nameEn,
      countryId: rawCountryId,
      regionId,
      activeStatus,
      mappingStatus: "unmappedCountry",
      source: "legacy_villages",
      warnings,
      mappingConfidence: "unknown",
      aliasResolved: false,
      unmapped: true,
    });
  }

  const alias = mapCityWithAliasGuard(
    input.documentId,
    input.aliases ?? [],
  );

  if (alias.ambiguous) {
    for (const w of alias.warnings) warnings.push(w);
    warnings.push({
      code: "ambiguous_city_country_guard",
      field: "id",
      message:
        "Ambiguous city alias — country kept from dolh only; no auto-pick from name",
      severity: "warning",
    });
    return cityMapBase(input, {
      canonicalCityId: input.documentId,
      safeName,
      nameAr,
      nameEn,
      countryId: resolved.canonicalCountryId,
      regionId,
      activeStatus,
      mappingStatus: "ambiguousCountry",
      source: "legacy_villages",
      warnings,
      mappingConfidence: "low",
      aliasResolved: false,
      unmapped: false,
    });
  }

  // Unmapped city alias is normal for non-SA hubs — keep document id; country mapping stands.
  const aliasResolved =
    alias.cityId != null && alias.cityId !== input.documentId;
  if (aliasResolved) {
    // alias.warnings empty on mapped path
  } else if (alias.warnings.some((w) => w.code === "unmapped_city")) {
    // Soft: do not elevate to unmappedCountry; identity remains document id.
  }

  const canonicalCityId = alias.cityId ?? input.documentId;
  return cityMapBase(input, {
    canonicalCityId,
    safeName,
    countryId: resolved.canonicalCountryId,
    regionId,
    activeStatus,
    mappingStatus: "validMapped",
    source: "legacy_villages",
    warnings,
    mappingConfidence: resolved.confidence,
    aliasResolved,
    unmapped: false,
  });
}

export function mapCityWithAliasGuard(
  legacyCityId: string | null | undefined,
  aliases: CityAliasEntry[],
): GeographyCityMapResult {
  const result = resolveCityId(legacyCityId, aliases);
  if (result.status === "ambiguous") {
    return {
      cityId: null,
      ambiguous: true,
      warnings: [
        {
          code: "AMBIGUOUS_CITY",
          field: "cityId",
          message: `Ambiguous city — candidates: ${result.candidates.join(",")}`,
          severity: "error",
        },
      ],
    };
  }
  if (result.status === "unmapped") {
    return {
      cityId: null,
      ambiguous: false,
      warnings: [
        {
          code: "unmapped_city",
          field: "cityId",
          message: `Unmapped city: ${result.input}`,
          severity: "warning",
        },
      ],
    };
  }
  return { cityId: result.cityId, ambiguous: false, warnings: [] };
}

/**
 * Phase 4A-3 — map Legacy mkan/{id} → canonical landmark read fields.
 *
 * Country identity ONLY from `Rev_dolh` DocumentReference (never from name/coords).
 * City identity ONLY from `id_vill` DocumentReference → villages/{id}.
 * Region from optional `id_cit` DocumentReference → cities/{id} (Legacy region).
 * Active from `acctev`. Ordering field for reads is `naim` (Customer evidence).
 * Images → LandmarkImageSummary only (no URLs).
 */
export type GeographyLandmarkDocMapResult = {
  id: string;
  sourceDocumentId: string;
  canonicalLandmarkId: string;
  safeName: string;
  nameAr: string | null;
  nameEn: string | null;
  /** Resolved country identity (alias-collapsed). Prefer canonicalCountryId. */
  countryId: string;
  /** Raw Rev_dolh countries/{id} — never alias-collapsed. */
  sourceCountryDocumentId: string;
  /** Alias-resolved canonical country id (empty when country unmapped). */
  canonicalCountryId: string;
  cityId: string;
  regionId: string | null;
  activeStatus: LandmarkActiveStatus;
  mappingStatus: LandmarkMappingStatus;
  coordinates: { latitude: number; longitude: number } | null;
  imageSummary: LandmarkImageSummary;
  /** Admin-safe https preview URL (detail only). */
  imagePreviewUrl: string | null;
  source: "legacy_mkan";
  warnings: MappingWarning[];
  mappingConfidence: MappingConfidence;
  unmapped: boolean;
};

function extractLandmarkCoordinates(
  data: Record<string, unknown>,
): { latitude: number; longitude: number } | null {
  const loc = data.Location ?? data.location;
  if (loc == null) return null;
  if (typeof loc === "object") {
    const o = loc as Record<string, unknown>;
    const lat = num(o.latitude ?? o._latitude ?? o.lat);
    const lng = num(o.longitude ?? o._longitude ?? o.lng ?? o.lon);
    if (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
    ) {
      return { latitude: lat, longitude: lng };
    }
  }
  return null;
}

function landmarkMapBase(
  input: { documentId: string },
  fields: Omit<
    GeographyLandmarkDocMapResult,
    "sourceDocumentId" | "canonicalLandmarkId" | "id" | "nameAr" | "nameEn"
  > & {
    canonicalLandmarkId: string;
    nameAr?: string | null;
    nameEn?: string | null;
  },
): GeographyLandmarkDocMapResult {
  return {
    id: fields.canonicalLandmarkId,
    sourceDocumentId: input.documentId,
    canonicalLandmarkId: fields.canonicalLandmarkId,
    safeName: fields.safeName,
    nameAr: fields.nameAr ?? null,
    nameEn: fields.nameEn ?? null,
    countryId: fields.countryId,
    sourceCountryDocumentId: fields.sourceCountryDocumentId,
    canonicalCountryId: fields.canonicalCountryId,
    cityId: fields.cityId,
    regionId: fields.regionId,
    activeStatus: fields.activeStatus,
    mappingStatus: fields.mappingStatus,
    coordinates: fields.coordinates,
    imageSummary: fields.imageSummary,
    imagePreviewUrl: fields.imagePreviewUrl ?? null,
    source: fields.source,
    warnings: fields.warnings,
    mappingConfidence: fields.mappingConfidence,
    unmapped: fields.unmapped,
  };
}

export function mapLandmarkFromLegacyDoc(input: {
  documentId: string;
  data: Record<string, unknown>;
  aliases?: CityAliasEntry[];
}): GeographyLandmarkDocMapResult {
  const warnings: MappingWarning[] = [];
  const rawCountryId = extractLegacyDocRefId(input.data.Rev_dolh);
  const rawCityId = extractLegacyDocRefId(input.data.id_vill);
  const regionId = extractLegacyDocRefId(input.data.id_cit);
  const sourceCountryDocumentId = rawCountryId ?? "";
  const nameAr = str(input.data.naim);
  const nameEn = str(input.data.name);
  const safeName = nameAr ?? nameEn ?? input.documentId;
  const coordinates = extractLandmarkCoordinates(input.data);
  const imageSummary = summarizeLandmarkImages(input.data);
  const imagePreviewUrl = extractLandmarkImagePreviewUrl(input.data);

  let activeStatus: LandmarkActiveStatus = "unknown";
  if (typeof input.data.acctev === "boolean") {
    activeStatus = input.data.acctev ? "active" : "inactive";
  }

  const classified = classifyLegacyLandmarkRecord({
    documentId: input.documentId,
    data: input.data,
    countryDocId: rawCountryId,
    cityDocId: rawCityId,
  });

  if (classified.classification === "malformed") {
    warnings.push({
      code: "malformed_landmark",
      field: "id",
      message: `Malformed landmark record: ${classified.reasons.join(",")}`,
      severity: "error",
    });
    return landmarkMapBase(input, {
      canonicalLandmarkId: input.documentId,
      safeName,
      countryId: sourceCountryDocumentId,
      sourceCountryDocumentId,
      canonicalCountryId: "",
      cityId: rawCityId ?? "",
      regionId,
      activeStatus,
      mappingStatus: "malformed",
      coordinates,
      imageSummary,
      imagePreviewUrl,
      source: "legacy_mkan",
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
    });
  }

  if (classified.classification === "test_or_noncanonical") {
    warnings.push({
      code: "test_or_noncanonical_landmark",
      field: "id",
      message: `Test/noncanonical landmark: ${classified.reasons.join(",")}`,
      severity: "warning",
    });
    return landmarkMapBase(input, {
      canonicalLandmarkId: input.documentId,
      safeName,
      countryId: sourceCountryDocumentId,
      sourceCountryDocumentId,
      canonicalCountryId: "",
      cityId: rawCityId ?? "",
      regionId,
      activeStatus,
      mappingStatus: "testOrNoncanonical",
      coordinates,
      imageSummary,
      imagePreviewUrl,
      source: "legacy_mkan",
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
    });
  }

  if (!rawCountryId) {
    warnings.push({
      code: "missing_country_relation",
      field: "Rev_dolh",
      message:
        "Landmark missing Rev_dolh country DocumentReference — not inventing from name/coords",
      severity: "error",
    });
    return landmarkMapBase(input, {
      canonicalLandmarkId: input.documentId,
      safeName,
      countryId: "",
      sourceCountryDocumentId: "",
      canonicalCountryId: "",
      cityId: rawCityId ?? "",
      regionId,
      activeStatus,
      mappingStatus: "unmappedCountry",
      coordinates,
      imageSummary,
      imagePreviewUrl,
      source: "legacy_mkan",
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
    });
  }

  if (
    classifyLegacyCountryRecord({ documentId: rawCountryId, data: {} })
      .classification === "test_or_noncanonical" ||
    /^cp5_country_\d+$/.test(rawCountryId)
  ) {
    warnings.push({
      code: "test_or_noncanonical_country_relation",
      field: "Rev_dolh",
      message: `Landmark linked to CP5/test country ${rawCountryId}`,
      severity: "warning",
    });
    return landmarkMapBase(input, {
      canonicalLandmarkId: input.documentId,
      safeName,
      countryId: rawCountryId,
      sourceCountryDocumentId: rawCountryId,
      canonicalCountryId: "",
      cityId: rawCityId ?? "",
      regionId,
      activeStatus,
      mappingStatus: "testOrNoncanonical",
      coordinates,
      imageSummary,
      imagePreviewUrl,
      source: "legacy_mkan",
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
    });
  }

  if (!rawCityId) {
    warnings.push({
      code: "missing_city_relation",
      field: "id_vill",
      message:
        "Landmark missing id_vill city DocumentReference — not inventing from name/coords",
      severity: "error",
    });
    // Still resolve country for diagnostics, but status is unmappedCity.
    const countryResolvedEarly = resolveCanonicalCountryId(rawCountryId);
    const earlyCanonical =
      countryResolvedEarly.status === "mapped"
        ? countryResolvedEarly.canonicalCountryId
        : "";
    return landmarkMapBase(input, {
      canonicalLandmarkId: input.documentId,
      safeName,
      countryId: earlyCanonical || rawCountryId,
      sourceCountryDocumentId: rawCountryId,
      canonicalCountryId: earlyCanonical,
      cityId: "",
      regionId,
      activeStatus,
      mappingStatus: "unmappedCity",
      coordinates,
      imageSummary,
      imagePreviewUrl,
      source: "legacy_mkan",
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
    });
  }

  if (
    classifyLegacyCityRecord({
      documentId: rawCityId,
      data: {},
      countryDocId: rawCountryId,
    }).classification === "test_or_noncanonical" ||
    /^cp5_(city|village|vill)_/i.test(rawCityId)
  ) {
    warnings.push({
      code: "test_or_noncanonical_city_relation",
      field: "id_vill",
      message: `Landmark linked to CP5/test city ${rawCityId}`,
      severity: "warning",
    });
    return landmarkMapBase(input, {
      canonicalLandmarkId: input.documentId,
      safeName,
      countryId: rawCountryId,
      sourceCountryDocumentId: rawCountryId,
      canonicalCountryId: "",
      cityId: rawCityId,
      regionId,
      activeStatus,
      mappingStatus: "testOrNoncanonical",
      coordinates,
      imageSummary,
      imagePreviewUrl,
      source: "legacy_mkan",
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
    });
  }

  const resolvedCountry = resolveCanonicalCountryId(rawCountryId);
  if (resolvedCountry.status === "unmapped") {
    warnings.push({
      code: "unmapped_country",
      field: "Rev_dolh",
      message: `Unmapped country relation: ${rawCountryId}`,
      severity: "error",
    });
    return landmarkMapBase(input, {
      canonicalLandmarkId: input.documentId,
      safeName,
      countryId: rawCountryId,
      sourceCountryDocumentId: rawCountryId,
      canonicalCountryId: "",
      cityId: rawCityId,
      regionId,
      activeStatus,
      mappingStatus: "unmappedCountry",
      coordinates,
      imageSummary,
      imagePreviewUrl,
      source: "legacy_mkan",
      warnings,
      mappingConfidence: "unknown",
      unmapped: true,
    });
  }

  const cityAlias = mapCityWithAliasGuard(
    rawCityId,
    input.aliases ?? [],
  );

  if (cityAlias.ambiguous) {
    for (const w of cityAlias.warnings) warnings.push(w);
    warnings.push({
      code: "ambiguous_city_guard",
      field: "id_vill",
      message:
        "Ambiguous city alias on landmark id_vill — no auto-pick from name/coords",
      severity: "warning",
    });
    return landmarkMapBase(input, {
      canonicalLandmarkId: input.documentId,
      safeName,
      countryId: resolvedCountry.canonicalCountryId,
      sourceCountryDocumentId: rawCountryId,
      canonicalCountryId: resolvedCountry.canonicalCountryId,
      cityId: rawCityId,
      regionId,
      activeStatus,
      mappingStatus: "ambiguousCity",
      coordinates,
      imageSummary,
      imagePreviewUrl,
      source: "legacy_mkan",
      warnings,
      mappingConfidence: "low",
      unmapped: false,
    });
  }

  // Soft unmapped city alias: keep villages document id (Phase 4A-2 pattern).
  const cityId = cityAlias.cityId ?? rawCityId;

  return landmarkMapBase(input, {
    canonicalLandmarkId: input.documentId,
    safeName,
    countryId: resolvedCountry.canonicalCountryId,
    sourceCountryDocumentId: rawCountryId,
    canonicalCountryId: resolvedCountry.canonicalCountryId,
    cityId,
    regionId,
    activeStatus,
    mappingStatus: "validMapped",
    coordinates,
    imageSummary,
      imagePreviewUrl,
    source: "legacy_mkan",
    warnings,
    mappingConfidence: resolvedCountry.confidence,
    unmapped: false,
  });
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "object" && v && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}
