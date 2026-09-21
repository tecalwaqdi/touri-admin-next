/**
 * Legacy Firestore field names for P0 master controlled writes.
 * Reads map domain-specific lifecycle flags; Production patches must match.
 *
 * - fleet (transport_company): `actev`
 * - partner (mkan isShrek): `acctev` (same as landmarks)
 * - vehicle_catalog (type_car): `actev` (primary in mapVehicleTypeFromLegacyDoc)
 * - guide (user is_tour_guide): status in metadata only — no generic `active`
 */

import type { P0WriteDomain } from "@/application/controlled-writes/P0WriteGates";
import type { P0MasterWriteAction } from "@/application/controlled-writes/P0MasterControlledWriteService";

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

function strMeta(
  metadata: Record<string, string | number | boolean | null> | undefined,
  ...keys: string[]
): string | undefined {
  if (!metadata) return undefined;
  for (const k of keys) {
    const v = metadata[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function numMeta(
  metadata: Record<string, string | number | boolean | null> | undefined,
  key: string,
): number | undefined {
  if (!metadata) return undefined;
  const v = metadata[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

/**
 * Map allowlisted UI / canonical metadata onto Legacy field names per domain.
 * Unknown keys are dropped (never pass-through raw canonical names to Firestore).
 */
export function mapP0WriteMetadataToLegacy(
  domain: P0WriteDomain,
  metadata: Record<string, string | number | boolean | null> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};

  if (domain === "guide") {
    // Status / review fields are Domain SoT keys — pass through as-is.
    for (const key of [
      "tour_guide_status",
      "tour_guide_reviewed_at",
      "tour_guide_rejection_reason",
      "tour_guide_permit_url",
      "is_tour_guide",
    ]) {
      if (key in metadata && metadata[key] != null) {
        out[key] = metadata[key];
      }
    }
    return out;
  }

  if (domain === "fleet") {
    const name =
      strMeta(metadata, "naim", "displayName", "name", "displayNameAr") ??
      strMeta(metadata, "displayNameEn");
    if (name) out.naim = name;

    const license = strMeta(metadata, "license_number", "licenseNumber");
    if (license) out.license_number = license;

    const phone = strMeta(metadata, "phone");
    if (phone) out.phone = phone;

    const email = strMeta(metadata, "email");
    if (email) out.email = email;

    const countryId = strMeta(metadata, "countryId");
    if (countryId) {
      out.Rev_dolh = legacyDocRef("countries", countryId);
      out.dolh = legacyDocRef("countries", countryId);
    }

    const countryText = strMeta(metadata, "dolh_text", "countryText");
    if (countryText) out.dolh_text = countryText;

    if (typeof metadata.actev === "boolean") out.actev = metadata.actev;
    return out;
  }

  if (domain === "partner") {
    const nameAr = strMeta(metadata, "displayNameAr", "naim");
    const nameEn = strMeta(metadata, "displayNameEn", "name");
    if (nameAr) out.naim = nameAr;
    if (nameEn) out.name = nameEn;
    const namesI18n = buildNamesI18n(nameAr, nameEn);
    if (namesI18n) out.names_i18n = namesI18n;
    // Single-name fallback when only one locale provided.
    if (!out.naim && nameEn) out.naim = nameEn;

    const descAr = strMeta(metadata, "descriptionAr", "osf");
    const descEn = strMeta(metadata, "descriptionEn");
    if (descAr) out.osf = descAr;
    else if (descEn) out.osf = descEn;
    const osfI18n = buildOsfI18n(descAr, descEn);
    if (osfI18n) out.osf_i18n = osfI18n;

    const countryId = strMeta(metadata, "countryId");
    if (countryId) out.Rev_dolh = legacyDocRef("countries", countryId);
    const cityId = strMeta(metadata, "cityId");
    if (cityId) out.id_vill = legacyDocRef("villages", cityId);
    const regionId = strMeta(metadata, "regionId");
    if (regionId) out.id_cit = legacyDocRef("cities", regionId);

    const address = strMeta(metadata, "address");
    if (address) out.address = address;

    const phone = strMeta(metadata, "phone", "mdh");
    if (phone) out.mdh = phone;

    const email = strMeta(metadata, "email", "EmailUser");
    if (email) out.EmailUser = email;

    const category = strMeta(metadata, "category", "tsnef");
    if (category) {
      out.tsnef = category;
      out.category = category;
    }

    const lat = numMeta(metadata, "lat");
    const lng = numMeta(metadata, "lng");
    if (lat != null && lng != null) {
      out.Location = { latitude: lat, longitude: lng };
      out.lat = lat;
      out.lng = lng;
      if (!out.address) {
        out.address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    }

    if (typeof metadata.isShrek === "boolean") out.isShrek = metadata.isShrek;
    if (typeof metadata.acctev === "boolean") out.acctev = metadata.acctev;
    return out;
  }

  if (domain === "vehicle_catalog") {
    const nameAr = strMeta(metadata, "displayNameAr", "naim");
    const nameEn = strMeta(metadata, "displayNameEn", "name");
    if (nameAr) out.naim = nameAr;
    if (nameEn) out.name = nameEn;
    const namesI18n = buildNamesI18n(nameAr, nameEn);
    if (namesI18n) out.names_i18n = namesI18n;
    if (!out.naim && nameEn) out.naim = nameEn;

    const codeCar = strMeta(metadata, "codeCar");
    if (codeCar) out.codeCar = codeCar;

    const sr = numMeta(metadata, "sr");
    if (sr != null) out.sr = sr;

    const passengers = numMeta(metadata, "passengers");
    if (passengers != null) out.passengers = passengers;

    const luggage = numMeta(metadata, "luggage");
    if (luggage != null) out.luggage = luggage;

    const countryId = strMeta(metadata, "countryId");
    if (countryId) out.dolh = legacyDocRef("countries", countryId);

    if (typeof metadata.actev === "boolean") out.actev = metadata.actev;
    return out;
  }

  // region domain — pass minimal known keys; geography has its own writer.
  const nameAr = strMeta(metadata, "displayNameAr", "naim");
  const nameEn = strMeta(metadata, "displayNameEn", "name");
  if (nameAr) out.naim = nameAr;
  if (nameEn) out.name = nameEn;
  const namesI18n = buildNamesI18n(nameAr, nameEn);
  if (namesI18n) out.names_i18n = namesI18n;
  const countryId = strMeta(metadata, "countryId");
  if (countryId) {
    out.Rev_dolh = legacyDocRef("countries", countryId);
    out.countryId = countryId;
  }
  return out;
}

/** Lifecycle fields for create/activate/deactivate/archive — domain-specific Legacy names. */
export function applyP0LegacyLifecycleFields(
  domain: P0WriteDomain,
  action: P0MasterWriteAction,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...patch };
  // Never leave generic active on non-guide domains that use Legacy flags.
  delete out.active;

  if (domain === "guide") {
    // Status transitions live in metadata (tour_guide_status). No active/acctev.
    delete out.archived;
    return out;
  }

  if (domain === "fleet" || domain === "vehicle_catalog") {
    if (action === "activate") out.actev = true;
    if (action === "deactivate") out.actev = false;
    if (action === "archive") {
      out.actev = false;
      out.archived = true;
    }
    return out;
  }

  // partner (+ region): acctev like landmarks / cities-as-regions
  if (action === "activate") out.acctev = true;
  if (action === "deactivate") out.acctev = false;
  if (action === "archive") {
    out.acctev = false;
    out.archived = true;
  }
  return out;
}

export function p0LegacyCreateDefaults(
  domain: P0WriteDomain,
): Record<string, unknown> {
  if (domain === "guide") {
    return { is_tour_guide: true };
  }
  if (domain === "partner") {
    return {
      isShrek: true,
      acctev: true,
      archived: false,
      tsnef: "شريك سياحي",
    };
  }
  if (domain === "fleet" || domain === "vehicle_catalog") {
    return { actev: true, archived: false };
  }
  // region
  return { acctev: true, archived: false };
}
