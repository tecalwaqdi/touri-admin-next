/**
 * Legacy Firestore field names for geography controlled writes.
 * Reads map `acctev` (mkan / villages / cities-as-regions); writes must match.
 */

import type { GeographyResource, GeographyWriteAction } from "@/application/controlled-writes/geography/GeographyControlledWriteService";

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
  if (action === "archive") out.acctev = false;

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
