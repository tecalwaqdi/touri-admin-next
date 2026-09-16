/**
 * Region integration — Country → Region → City cascade helpers.
 * Do NOT force region on legacy records without one.
 */

export type RegionCascadeSelection = {
  countryId: string | null;
  regionId: string | null;
  cityId: string | null;
};

export function normalizeRegionCascade(
  input: Partial<RegionCascadeSelection>,
): RegionCascadeSelection {
  const countryId = input.countryId?.trim() || null;
  const regionId = input.regionId?.trim() || null;
  const cityId = input.cityId?.trim() || null;

  // Clearing country clears descendants; clearing region clears city.
  if (!countryId) {
    return { countryId: null, regionId: null, cityId: null };
  }
  if (!regionId) {
    return { countryId, regionId: null, cityId: null };
  }
  return { countryId, regionId, cityId };
}

export function regionFilterClause(input: {
  regionId?: string | null;
  allowNullRegion?: boolean;
}): { mode: "exact" | "any"; regionId: string | null } {
  const id = input.regionId?.trim() || null;
  if (!id) {
    return { mode: "any", regionId: null };
  }
  return { mode: "exact", regionId: id };
}

export function recordMatchesRegionFilter(
  recordRegionId: string | null | undefined,
  filter: { mode: "exact" | "any"; regionId: string | null },
): boolean {
  if (filter.mode === "any") return true;
  if (!recordRegionId) return false; // do not force-match null regions
  return recordRegionId === filter.regionId;
}

export const REGION_INTEGRATION_SURFACES = [
  "drivers",
  "agents",
  "partners",
  "fleet",
  "guides",
  "cities",
  "landmarks",
  "reports",
] as const;
