/**
 * Phase 3.7 — Cross-city scope consistency.
 * Detect tripCity != driverCity → display mismatch; NEVER relocate entities.
 */

export type ScopeConsistencyStatus =
  | "consistent"
  | "cross_city"
  | "unknown"
  | "not_applicable";

export type CrossCityCheckResult = {
  scopeConsistencyStatus: ScopeConsistencyStatus;
  tripCityId: string | null;
  driverCityId: string | null;
  displayMismatch: boolean;
  warnings: string[];
};

/**
 * Compare canonical city ids when both known.
 * Missing either side → unknown (not invented).
 * Both null → not_applicable.
 */
export function evaluateCrossCityScope(input: {
  tripCityId: string | null | undefined;
  driverCityId: string | null | undefined;
}): CrossCityCheckResult {
  const tripCityId =
    input.tripCityId == null || String(input.tripCityId).trim() === ""
      ? null
      : String(input.tripCityId).trim();
  const driverCityId =
    input.driverCityId == null || String(input.driverCityId).trim() === ""
      ? null
      : String(input.driverCityId).trim();

  if (tripCityId == null && driverCityId == null) {
    return {
      scopeConsistencyStatus: "not_applicable",
      tripCityId,
      driverCityId,
      displayMismatch: false,
      warnings: ["Both trip and driver city unknown — not_applicable"],
    };
  }

  if (tripCityId == null || driverCityId == null) {
    return {
      scopeConsistencyStatus: "unknown",
      tripCityId,
      driverCityId,
      displayMismatch: false,
      warnings: ["Incomplete city pair — cannot assert consistency"],
    };
  }

  if (tripCityId === driverCityId) {
    return {
      scopeConsistencyStatus: "consistent",
      tripCityId,
      driverCityId,
      displayMismatch: false,
      warnings: [],
    };
  }

  return {
    scopeConsistencyStatus: "cross_city",
    tripCityId,
    driverCityId,
    displayMismatch: true,
    warnings: [
      `Cross-city mismatch: tripCity=${tripCityId} driverCity=${driverCityId} (display only; no relocate)`,
    ],
  };
}
