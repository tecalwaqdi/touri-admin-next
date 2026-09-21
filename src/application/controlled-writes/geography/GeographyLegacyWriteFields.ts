/**
 * Legacy Firestore field names for geography controlled writes.
 * Reads map `acctev` (mkan / villages / cities-as-regions); writes must match.
 */

import type {
  GeographyResource,
  GeographyWriteAction,
  GeographyWriteCommand,
} from "@/application/controlled-writes/geography/GeographyControlledWriteService";

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
 * Never passes through unknown keys.
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

  if (metadata.countryId?.trim()) {
    out.countryId = metadata.countryId.trim();
  }
  if (metadata.regionId?.trim()) out.regionId = metadata.regionId.trim();
  if (metadata.cityId?.trim()) out.cityId = metadata.cityId.trim();
  if (metadata.category?.trim()) out.category = metadata.category.trim();

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
    out.lat = metadata.lat;
    out.lng = metadata.lng;
  }

  if (resource === "country") {
    if (nameEn) out.nameEn = nameEn;
    if (nameAr) out.nameAr = nameAr;
  }

  return out;
}
