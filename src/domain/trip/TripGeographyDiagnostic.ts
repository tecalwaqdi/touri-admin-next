/**
 * Phase 4A-4 — Safe per-trip trip geography diagnostics (no PII).
 *
 * Never invents city from country / coords / names / vill_text / landmark text.
 * Never fetches mkan docs (no N+1). Landmark→city is NOT claimed unless separately proven.
 */

import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import type { CityAliasEntry } from "@/domain/geography/CityAliasResolver";
import type { TripMappingStatus } from "@/domain/trip/TripRecordClassification";
import type { TripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";

/** How city identity was (or was not) evidenced on the order document. */
export type CityEvidenceKind =
  | "direct_vill"
  | "legacy_alias"
  | "landmark_relation"
  | "other_proven_legacy"
  | "none";

/**
 * Exact vill-field presence cases for missing-city audits.
 * Counts must be by exact case — not collapsed without evidence.
 */
export type VillPresenceCase =
  | "absent_key"
  | "null"
  | "empty_string"
  | "wrong_type"
  | "unextractable_ref_shape"
  | "different_alias_only"
  | "region_ref_cities_user_now_only"
  | "display_text_only"
  | "present_document_ref"
  | "present_path_string";

/** Closing-gate city bucket (FINAL POLICY: only unmapped/malformed block). */
export type CityClosingBucket =
  | "mapped"
  | "legitimate_not_represented"
  | "testOrNoncanonical"
  | "unmapped"
  | "malformed";

export type CountryMappingDiag =
  | "mapped"
  | "unmapped"
  | "missing"
  | "testOrNoncanonical"
  | "malformed";

export type CityMappingDiag =
  | "mapped"
  | "missing"
  | "ambiguous"
  | "testOrNoncanonical"
  | "not_represented";

export type TripGeographyDiagnostic = {
  sourceDocumentId: string;
  sourceCountryPath: string | null;
  sourceCountryDocumentId: string | null;
  sourceCityPath: string | null;
  sourceCityDocumentId: string | null;
  sourcePickupLandmarkPath: string | null;
  sourceDestinationLandmarkPath: string | null;
  landmarkStopCount: number;
  countryMapping: CountryMappingDiag;
  cityMapping: CityMappingDiag;
  mappingStatus: TripMappingStatus;
  lifecycleStatus: TripLifecycleStatus | string;
  cityEvidenceKind: CityEvidenceKind;
  villPresenceCase: VillPresenceCase;
  /** True when Legacy writers allow omit/null and vill relation is absent. */
  cityKnowledge: "known" | "missing" | "not_represented" | "unknown";
  /** Closing bucket — legitimate_not_represented does not block live close. */
  proposedClosingBucket: CityClosingBucket;
  /** Non-sensitive structural fingerprint for 7-vs-7 pattern compare. */
  schemaPattern: TripSchemaPatternFingerprint;
};

export type TripSchemaPatternFingerprint = {
  villPresent: boolean;
  villPresenceCase: VillPresenceCase;
  revDolhPresent: boolean;
  listAmaknPresent: boolean;
  landmarkStopCount: number;
  statusCodePresent: boolean;
  paymentMethodClass: "cash" | "online" | "unknown" | "unmapped" | "absent";
  dataOrderPresent: boolean;
  bookingTypeClass: string | null;
  writerHint:
    | "created_by_function"
    | "created_by_client_cash_fallback"
    | "backend_source_external_api"
    | "unknown";
  hasCitiesUserNow: boolean;
  hasVillText: boolean;
  hasTotalApp: boolean;
  hasTotalVat: boolean;
  hasTotalMndob: boolean;
  hasTotalMndob2: boolean;
};

export type TripGeographyCounterBundle = {
  directCityMapped: number;
  legacyAliasCityMapped: number;
  landmarkEvidenceCityMapped: number;
  cityNotRepresented: number;
  cityMissingUnresolved: number;
  villPresenceCounts: Record<VillPresenceCase, number>;
};

export function emptyTripGeographyCounters(): TripGeographyCounterBundle {
  return {
    directCityMapped: 0,
    legacyAliasCityMapped: 0,
    landmarkEvidenceCityMapped: 0,
    cityNotRepresented: 0,
    cityMissingUnresolved: 0,
    villPresenceCounts: {
      absent_key: 0,
      null: 0,
      empty_string: 0,
      wrong_type: 0,
      unextractable_ref_shape: 0,
      different_alias_only: 0,
      region_ref_cities_user_now_only: 0,
      display_text_only: 0,
      present_document_ref: 0,
      present_path_string: 0,
    },
  };
}

function refPath(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : null;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.path === "string" && o.path.trim()) return o.path.trim();
  }
  const id = extractLegacyDocRefId(value);
  return id ? `unknown/${id}` : null;
}

function isDocRefLike(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") {
    const t = value.trim();
    return t.includes("/") || t.length > 0;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return (
      (typeof o.path === "string" && o.path.trim().length > 0) ||
      (typeof o.id === "string" && o.id.trim().length > 0)
    );
  }
  return false;
}

/**
 * Classify exact vill field presence on the order document.
 * Does not treat cities_user_now / vill_text / landmark text as vill.
 */
export function classifyVillPresence(
  data: Record<string, unknown>,
): VillPresenceCase {
  const hasVillKey = Object.prototype.hasOwnProperty.call(data, "vill");
  const vill = hasVillKey ? data.vill : undefined;

  if (!hasVillKey) {
    if (isDocRefLike(data.cities_user_now) && !isDocRefLike(data.cityId) && !isDocRefLike(data.city_id)) {
      // Region hint only — not product city.
      if (
        typeof data.vill_text === "string" &&
        data.vill_text.trim().length > 0
      ) {
        return "region_ref_cities_user_now_only";
      }
      return "region_ref_cities_user_now_only";
    }
    if (
      isDocRefLike(data.cityId) ||
      isDocRefLike(data.city_id) ||
      isDocRefLike(data.id_vill) ||
      isDocRefLike(data.Rev_vill) ||
      isDocRefLike(data.villageId)
    ) {
      return "different_alias_only";
    }
    if (typeof data.vill_text === "string" && data.vill_text.trim().length > 0) {
      return "display_text_only";
    }
    return "absent_key";
  }

  if (vill === null) return "null";
  if (vill === "") return "empty_string";
  if (typeof vill === "string") {
    const t = vill.trim();
    if (!t) return "empty_string";
    return "present_path_string";
  }
  if (typeof vill === "number" || typeof vill === "boolean") {
    return "wrong_type";
  }
  if (typeof vill === "object") {
    const id = extractLegacyDocRefId(vill);
    if (id) return "present_document_ref";
    return "unextractable_ref_shape";
  }
  return "wrong_type";
}

function landmarkPaths(data: Record<string, unknown>): {
  pickup: string | null;
  destination: string | null;
  count: number;
} {
  const list = data.listAmakn;
  if (!Array.isArray(list) || list.length === 0) {
    return { pickup: null, destination: null, count: 0 };
  }
  const stopPath = (stop: unknown): string | null => {
    if (stop == null || typeof stop !== "object") return null;
    const o = stop as Record<string, unknown>;
    const singular = o.Revmkan ?? o.revmkan;
    if (singular != null) return refPath(singular);
    const arr = o.mkan_rev ?? o.mkanRev;
    if (Array.isArray(arr) && arr.length) return refPath(arr[0]);
    return null;
  };
  return {
    pickup: stopPath(list[0]),
    destination: list.length >= 2 ? stopPath(list[list.length - 1]) : null,
    count: list.length,
  };
}

function paymentMethodClass(
  data: Record<string, unknown>,
): TripSchemaPatternFingerprint["paymentMethodClass"] {
  if (!Object.prototype.hasOwnProperty.call(data, "PaymentMethod")) {
    return "absent";
  }
  const raw = data.PaymentMethod;
  if (raw == null || raw === "") return "unknown";
  const s = String(raw);
  if (s === "Cash") return "cash";
  if (s === "OnlinePayment") return "online";
  return "unmapped";
}

function writerHint(
  data: Record<string, unknown>,
): TripSchemaPatternFingerprint["writerHint"] {
  if (data.created_by_client_cash_fallback === true) {
    return "created_by_client_cash_fallback";
  }
  if (data.created_by_function === true) {
    return "created_by_function";
  }
  if (data.backend_source === "external_api") {
    return "backend_source_external_api";
  }
  return "unknown";
}

export function buildTripSchemaPatternFingerprint(
  data: Record<string, unknown>,
): TripSchemaPatternFingerprint {
  const villCase = classifyVillPresence(data);
  const landmarks = landmarkPaths(data);
  const tripType =
    typeof data.trip_type === "string" && data.trip_type.trim()
      ? data.trip_type.trim()
      : null;
  return {
    villPresent:
      villCase === "present_document_ref" || villCase === "present_path_string",
    villPresenceCase: villCase,
    revDolhPresent: extractLegacyDocRefId(data.Rev_dolh) != null,
    listAmaknPresent: Array.isArray(data.listAmakn) && data.listAmakn.length > 0,
    landmarkStopCount: landmarks.count,
    statusCodePresent:
      typeof data.status_code === "string" && data.status_code.trim().length > 0,
    paymentMethodClass: paymentMethodClass(data),
    dataOrderPresent: data.data_order != null && data.data_order !== "",
    bookingTypeClass: tripType,
    writerHint: writerHint(data),
    hasCitiesUserNow: isDocRefLike(data.cities_user_now),
    hasVillText:
      typeof data.vill_text === "string" && data.vill_text.trim().length > 0,
    hasTotalApp: Object.prototype.hasOwnProperty.call(data, "total_app"),
    hasTotalVat: Object.prototype.hasOwnProperty.call(data, "total_vat"),
    hasTotalMndob: Object.prototype.hasOwnProperty.call(data, "total_mndob"),
    hasTotalMndob2: Object.prototype.hasOwnProperty.call(data, "total_mndob2"),
  };
}

/**
 * Legacy writers (createCashBooking / finalizeNGenius / payment-api / client cash
 * fallback) treat order.vill as optional DocumentReference — omit or null-delete.
 * That proves absence of the city *relation* can be legitimate on the write path.
 * Display text / region / landmarks are NOT substitutes for the relation.
 */
export function legacyVillOptionalProven(): true {
  return true;
}

function assessCountryMapping(
  rawCountryId: string | null,
  mappingStatus: TripMappingStatus,
): CountryMappingDiag {
  if (mappingStatus === "malformed") return "malformed";
  if (mappingStatus === "testOrNoncanonical") return "testOrNoncanonical";
  if (!rawCountryId) return "missing";
  if (mappingStatus === "unmappedCountry") {
    const resolved = resolveCanonicalCountryId(rawCountryId);
    return resolved.status === "mapped" ? "mapped" : "unmapped";
  }
  const resolved = resolveCanonicalCountryId(rawCountryId);
  return resolved.status === "mapped" ? "mapped" : "unmapped";
}

function cityEvidenceKindFor(
  villCase: VillPresenceCase,
  aliases: CityAliasEntry[],
  rawCityId: string | null,
): CityEvidenceKind {
  if (
    villCase === "present_document_ref" ||
    villCase === "present_path_string"
  ) {
    // direct_vill = city DocumentReference was on order.vill.
    // legacy_alias only when an explicit alias entry remaps to a different canonical id.
    // Identity passthrough (city_sa_* already canonical) is NOT legacy_alias.
    if (rawCityId && aliases.length > 0) {
      const explicit = aliases.filter((a) => a.aliasId === rawCityId);
      if (explicit.length === 1) {
        const target = explicit[0].canonicalCityId;
        if (target && target !== rawCityId) {
          return "legacy_alias";
        }
      }
    }
    return "direct_vill";
  }
  // landmark_relation intentionally never claimed without mkan fetch + code proof.
  return "none";
}

/**
 * Build safe geography diagnostic for one order document + mapper outcome.
 */
export function buildTripGeographyDiagnostic(input: {
  sourceDocumentId: string;
  data: Record<string, unknown>;
  mappingStatus: TripMappingStatus;
  lifecycleStatus: TripLifecycleStatus | string;
  sourceCountryPath: string | null;
  sourceCountryDocumentId: string | null;
  sourceCityPath: string | null;
  sourceCityDocumentId: string | null;
  sourcePickupLandmarkPath: string | null;
  sourceDestinationLandmarkPath: string | null;
  aliases?: CityAliasEntry[];
}): TripGeographyDiagnostic {
  const villCase = classifyVillPresence(input.data);
  const rawCountryId =
    input.sourceCountryDocumentId ||
    extractLegacyDocRefId(input.data.Rev_dolh);
  const rawCityId =
    input.sourceCityDocumentId || extractLegacyDocRefId(input.data.vill);
  const landmarks = landmarkPaths(input.data);
  const evidence = cityEvidenceKindFor(
    villCase,
    input.aliases ?? [],
    rawCityId,
  );

  const countryMapping = assessCountryMapping(
    rawCountryId,
    input.mappingStatus,
  );

  let cityMapping: CityMappingDiag;
  let cityKnowledge: TripGeographyDiagnostic["cityKnowledge"];
  let proposedClosingBucket: CityClosingBucket;

  if (input.mappingStatus === "malformed") {
    cityMapping = "missing";
    cityKnowledge = "unknown";
    proposedClosingBucket = "malformed";
  } else if (input.mappingStatus === "testOrNoncanonical") {
    cityMapping = "testOrNoncanonical";
    cityKnowledge = rawCityId ? "known" : "missing";
    proposedClosingBucket = "testOrNoncanonical";
  } else if (
    villCase === "present_document_ref" ||
    villCase === "present_path_string"
  ) {
    if (input.mappingStatus === "ambiguousCity") {
      cityMapping = "ambiguous";
      cityKnowledge = "known";
      proposedClosingBucket = "unmapped";
    } else if (
      input.mappingStatus === "validMapped" ||
      input.mappingStatus === "unmappedStatus"
    ) {
      cityMapping = "mapped";
      cityKnowledge = "known";
      proposedClosingBucket = "mapped";
    } else if (input.mappingStatus === "unmappedCity") {
      cityMapping = "missing";
      cityKnowledge = "unknown";
      proposedClosingBucket = "unmapped";
    } else {
      cityMapping = "mapped";
      cityKnowledge = "known";
      proposedClosingBucket = "mapped";
    }
  } else if (
    legacyVillOptionalProven() &&
    (villCase === "absent_key" ||
      villCase === "null" ||
      villCase === "region_ref_cities_user_now_only" ||
      villCase === "display_text_only")
  ) {
    // FINAL POLICY: optional Legacy vill absent → not_represented (does not block close).
    cityMapping = "not_represented";
    cityKnowledge = "not_represented";
    proposedClosingBucket = "legitimate_not_represented";
  } else if (
    villCase === "wrong_type" ||
    villCase === "unextractable_ref_shape" ||
    villCase === "empty_string"
  ) {
    cityMapping = "missing";
    cityKnowledge = "unknown";
    proposedClosingBucket = "malformed";
  } else if (villCase === "different_alias_only") {
    cityMapping = "missing";
    cityKnowledge = "unknown";
    proposedClosingBucket = "unmapped";
  } else {
    cityMapping = "missing";
    cityKnowledge = "missing";
    proposedClosingBucket = "unmapped";
  }

  return {
    sourceDocumentId: input.sourceDocumentId,
    sourceCountryPath: input.sourceCountryPath ?? refPath(input.data.Rev_dolh),
    sourceCountryDocumentId: rawCountryId,
    sourceCityPath: input.sourceCityPath ?? refPath(input.data.vill),
    sourceCityDocumentId: rawCityId,
    sourcePickupLandmarkPath:
      input.sourcePickupLandmarkPath ?? landmarks.pickup,
    sourceDestinationLandmarkPath:
      input.sourceDestinationLandmarkPath ?? landmarks.destination,
    landmarkStopCount: landmarks.count,
    countryMapping,
    cityMapping,
    mappingStatus: input.mappingStatus,
    lifecycleStatus: input.lifecycleStatus,
    cityEvidenceKind: evidence,
    villPresenceCase: villCase,
    cityKnowledge,
    proposedClosingBucket,
    schemaPattern: buildTripSchemaPatternFingerprint(input.data),
  };
}

export function tallyTripGeographyDiagnostic(
  counters: TripGeographyCounterBundle,
  diag: TripGeographyDiagnostic,
): void {
  counters.villPresenceCounts[diag.villPresenceCase] += 1;
  if (diag.cityEvidenceKind === "direct_vill" && diag.cityMapping === "mapped") {
    counters.directCityMapped += 1;
  } else if (
    diag.cityEvidenceKind === "legacy_alias" &&
    diag.cityMapping === "mapped"
  ) {
    counters.legacyAliasCityMapped += 1;
  } else if (diag.cityEvidenceKind === "landmark_relation") {
    counters.landmarkEvidenceCityMapped += 1;
  }

  if (diag.cityKnowledge === "not_represented") {
    counters.cityNotRepresented += 1;
  } else if (
    diag.mappingStatus === "unmappedCity" ||
    diag.cityMapping === "missing" ||
    diag.cityMapping === "ambiguous"
  ) {
    counters.cityMissingUnresolved += 1;
  }
}

/**
 * Compare non-sensitive schema patterns between two cohorts (e.g. 7 valid vs 7 unmapped).
 */
export function summarizeSchemaPatternCohorts(
  patterns: TripSchemaPatternFingerprint[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const bump = (k: string) => {
    out[k] = (out[k] ?? 0) + 1;
  };
  for (const p of patterns) {
    bump(`villPresent:${p.villPresent}`);
    bump(`villCase:${p.villPresenceCase}`);
    bump(`revDolh:${p.revDolhPresent}`);
    bump(`listAmakn:${p.listAmaknPresent}`);
    bump(`landmarkCount:${p.landmarkStopCount}`);
    bump(`status_code:${p.statusCodePresent}`);
    bump(`payment:${p.paymentMethodClass}`);
    bump(`data_order:${p.dataOrderPresent}`);
    bump(`trip_type:${p.bookingTypeClass ?? "null"}`);
    bump(`writer:${p.writerHint}`);
    bump(`cities_user_now:${p.hasCitiesUserNow}`);
    bump(`vill_text:${p.hasVillText}`);
  }
  return out;
}

/**
 * City closing buckets: only unmapped + malformed block.
 * mapped / legitimate_not_represented / testOrNoncanonical do not.
 */
export function tripCityClosingBucketsAllowClose(
  buckets: CityClosingBucket[],
): boolean {
  return buckets.every(
    (b) =>
      b === "mapped" ||
      b === "legitimate_not_represented" ||
      b === "testOrNoncanonical",
  );
}
