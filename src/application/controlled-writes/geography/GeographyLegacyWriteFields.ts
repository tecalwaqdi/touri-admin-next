/**
 * Legacy Firestore field names for geography controlled writes.
 * Reads map `acctev` (mkan / villages / cities-as-regions); writes must match.
 * Country refs use `{ path }` maps — Fake + WIF encodeValue promote to referenceValue.
 *
 * Landmark category SoT = `tsnef` (customer chips / whereIn). Amenity flags match
 * Legacy AdminaddMkan: ismsgd / isfood / ishmam / as_ads. City geo = `lat_ling`.
 */

import type {
  GeographyResource,
  GeographyWriteAction,
  GeographyWriteCommand,
} from "@/application/controlled-writes/geography/GeographyControlledWriteService";

/** Legacy Admin default landmark category (customer chip queries). */
export const LEGACY_DEFAULT_LANDMARK_CATEGORY = "معالم سياحية";

function legacyDocRef(collection: string, id: string): { path: string } {
  return { path: `${collection}/${id}` };
}

function buildNamesI18n(
  nameAr: string | undefined,
  nameEn: string | undefined,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (nameAr) out.ar = nameAr;
  if (nameEn) out.en = nameEn;
  return Object.keys(out).length ? out : undefined;
}

function buildOsfI18n(
  descAr: string | undefined,
  descEn: string | undefined,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (descAr) out.ar = descAr;
  if (descEn) out.en = descEn;
  return Object.keys(out).length ? out : undefined;
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
  if (resource === "landmark") {
    return {
      acctev: true,
      archived: false,
      tsnef: LEGACY_DEFAULT_LANDMARK_CATEGORY,
    };
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

  const namesI18n = buildNamesI18n(nameAr, nameEn);
  if (namesI18n) out.names_i18n = namesI18n;

  const descAr = metadata.descriptionAr?.trim();
  const descEn = metadata.descriptionEn?.trim();
  if (descAr) out.osf = descAr;
  else if (descEn) out.osf = descEn;
  const osfI18n = buildOsfI18n(descAr, descEn);
  if (osfI18n) out.osf_i18n = osfI18n;

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

    const category = metadata.category?.trim();
    if (category) {
      // Legacy SoT for customer category chips.
      out.tsnef = category;
      out.category = category;
    }

    const address = metadata.address?.trim();
    if (address) out.address = address;

    if (typeof metadata.isMosque === "boolean") out.ismsgd = metadata.isMosque;
    if (typeof metadata.isFood === "boolean") out.isfood = metadata.isFood;
    if (typeof metadata.isRestroom === "boolean") out.ishmam = metadata.isRestroom;
    if (typeof metadata.asAds === "boolean") out.as_ads = metadata.asAds;

    if (
      typeof metadata.rate === "number" &&
      Number.isFinite(metadata.rate) &&
      metadata.rate >= 0 &&
      metadata.rate <= 5
    ) {
      out.rate = metadata.rate;
    }
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
    const geo = {
      latitude: metadata.lat,
      longitude: metadata.lng,
    };
    if (resource === "landmark") {
      // Legacy mkan stores GeoPoint under Location.
      out.Location = geo;
      out.lat = metadata.lat;
      out.lng = metadata.lng;
      if (!out.address) {
        out.address = `${metadata.lat.toFixed(6)}, ${metadata.lng.toFixed(6)}`;
      }
    } else if (resource === "city") {
      // Legacy villages store optional geo under lat_ling.
      out.lat_ling = geo;
      out.lat = metadata.lat;
      out.lng = metadata.lng;
    } else {
      out.Location = geo;
      out.lat = metadata.lat;
      out.lng = metadata.lng;
    }
  }

  return out;
}
