/**
 * Per-resource Production detail enablement (PC-2).
 * Keep a resource false until its Production GET path is wired.
 */

export type DetailNavResource = "trips" | "drivers" | "customers" | "agents";

export const PRODUCTION_DETAIL_RESOURCE_ENABLED: Record<
  DetailNavResource,
  boolean
> = {
  trips: true,
  drivers: true,
  customers: true,
  agents: true,
};

export function isProductionDetailResourceEnabled(
  resource: DetailNavResource,
): boolean {
  return PRODUCTION_DETAIL_RESOURCE_ENABLED[resource] === true;
}

export function areProductionDetailRoutesEnabled(
  resource?: DetailNavResource,
): boolean {
  if (resource) return isProductionDetailResourceEnabled(resource);
  return (
    Object.keys(PRODUCTION_DETAIL_RESOURCE_ENABLED) as DetailNavResource[]
  ).every((r) => PRODUCTION_DETAIL_RESOURCE_ENABLED[r]);
}
