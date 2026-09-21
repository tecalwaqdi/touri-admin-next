/**
 * Legacy Firestore field names for geography controlled writes.
 * Reads map `acctev` (mkan / villages / cities-as-regions); writes must match.
 * Country refs use `{ path }` maps — Fake + WIF encodeValue promote to referenceValue.
 */

import type {
  GeographyResource,
  GeographyWriteAction,
  GeographyWriteCommand,
} from "@/application/controlled-writes/geography/GeographyControlledWriteService";

function legacyDocRef(collection: string, id: string): { path: string } {
  return { path: `${collection}/${id}` };
}

/** Lifecycle fields for create/activate/deactivate/archive on Legacy geo collections. */
export function applyGeographyLegacyLifecycleFields(
  resource: GeographyResource,
  action: GeographyWriteAction,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...patch };
  delete out.active;
  delete out.archived;

  if (resource === "country") {
    if (action === "activate") out.active = true;
    if (action === "deactivate") out.active = false;
    if (action === "archive") {
      out.archived = true;
      out.active = false;
    }
    return out;
  }

  if (action === "activate") out.acctev = true;
  if (action === "deactivate") out.acctev = false;
  if (action === "archive") {
    out.acctev = false;
    out.archived = true;
  }

  return out;
}

export function geographyLegacyCreateDefaults(
  resource: GeographyResource,
): Record<string, unknown> {
  if (resource === "country") {
    return { active: true, archived: false };
  }
  return { acctev: true, archived: false };
}

/**
 * Map allowlisted UI metadata onto Legacy field names.
 * Never passes through unknown keys. Never nulls omitted fields on edit.
 */
export function mapGeographyWriteMetadataToLegacy(
  resource: GeographyResource,
  metadata: GeographyWriteCommand["metadata"] | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};

  const nameAr = metadata.displayNameAr?.trim();
  const nameEn = metadata.displayNameEn?.trim();
  if (nameAr) out.naim = nameAr;
  if (nameEn) out.name = nameEn;

  if (resource === "country") {
    if (nameEn) out.nameEn = nameEn;
    if (nameAr) out.nameAr = nameAr;
    const iso = metadata.isoCode?.trim().toUpperCase();
    if (iso) {
      out.iso_code = iso;
      out.iso2 = iso;
    }
    const currency = metadata.currencyCode?.trim().toUpperCase();
    if (currency) {
      out.currency_code = currency;
      out.currencyCode = currency;
    }
  }

  if (resource === "city") {
    const countryId = metadata.countryId?.trim();
    if (countryId) out.dolh = legacyDocRef("countries", countryId);
    const regionId = metadata.regionId?.trim();
    if (regionId) out.cities = legacyDocRef("cities", regionId);
  }

  if (resource === "region") {
    const countryId = metadata.countryId?.trim();
    if (countryId) {
      out.Rev_dolh = legacyDocRef("countries", countryId);
      out.countryId = countryId;
    }
  }

  if (resource === "landmark") {
    const countryId = metadata.countryId?.trim();
    if (countryId) out.Rev_dolh = legacyDocRef("countries", countryId);
    const cityId = metadata.cityId?.trim();
    if (cityId) out.id_vill = legacyDocRef("villages", cityId);
    const regionId = metadata.regionId?.trim();
    if (regionId) out.id_cit = legacyDocRef("cities", regionId);
    if (metadata.category?.trim()) out.category = metadata.category.trim();
  }

  if (metadata.visibility === "hidden") {
    out.visibility = "hidden";
    out.hidden = true;
  } else if (metadata.visibility === "public") {
    out.visibility = "public";
    out.hidden = false;
  } else if (metadata.visibility === "pending") {
    out.visibility = "pending";
  }

  if (
    typeof metadata.lat === "number" &&
    Number.isFinite(metadata.lat) &&
    typeof metadata.lng === "number" &&
    Number.isFinite(metadata.lng)
  ) {
    // Legacy mkan stores GeoPoint under Location (see mapLandmarkFromLegacyDoc).
    out.Location = {
      latitude: metadata.lat,
      longitude: metadata.lng,
    };
    out.lat = metadata.lat;
    out.lng = metadata.lng;
  }

  return out;
}
