/**
 * Phase 3.5 Legacy status contract:
 * unknown / unproven status → `unmapped` (never guess nearest).
 */

import type { CanonicalTripStatus } from "@/types/trip";
import { DefaultLegacyTripStatusMapper } from "@/domain/trip/CanonicalTripStatus";

export type LegacyStatusMappingResult = {
  canonical: CanonicalTripStatus | "unmapped";
  legacyValue: string;
  confidence: "high" | "medium" | "low" | "unknown";
  warnings: string[];
  /** Unknown/unmapped → false; proven mapped → true */
  isSafeForOperationalAction: boolean;
  /** Base record may still be displayable when unmapped */
  isDisplayable: boolean;
};

/** High-confidence mappings proven in Phase 3 TRIP_STATUS_MAPPING.md */
const PROVEN_STATUS_CODE_MAP: Record<string, CanonicalTripStatus> = {
  pending_driver: "waiting_driver",
  awaiting_driver: "waiting_driver",
  pending: "waiting_driver",
  driver_assigned: "accepted",
  driver_arriving: "driver_en_route",
  driver_arrived: "arrived",
  trip_started: "started",
  trip_in_progress: "started",
  completed: "completed",
  trip_completed: "completed",
  cancelled_by_customer: "cancelled_by_customer",
  cancelled_by_driver: "cancelled_by_driver",
  cancelled_by_admin: "cancelled_by_system",
  cancelled: "cancelled_by_system",
  canceled: "cancelled_by_system",
  expired: "cancelled_by_system",
};

const fallback = new DefaultLegacyTripStatusMapper();

/**
 * Map Legacy order.status_code → canonical or `unmapped`.
 * Never guesses nearest neighbor for unknown values.
 */
export function mapLegacyTripStatusContract(
  legacyStatus: string | null | undefined,
): LegacyStatusMappingResult {
  if (legacyStatus == null || String(legacyStatus).trim() === "") {
    return {
      canonical: "unmapped",
      legacyValue: "",
      confidence: "unknown",
      warnings: ["Empty legacy status → unmapped"],
      isSafeForOperationalAction: false,
      isDisplayable: true,
    };
  }
  const key = String(legacyStatus).trim().toLowerCase();
  const proven = PROVEN_STATUS_CODE_MAP[key];
  if (proven) {
    return {
      canonical: proven,
      legacyValue: legacyStatus,
      confidence: key === "pending" ? "medium" : "high",
      warnings: [],
      isSafeForOperationalAction: true,
      isDisplayable: true,
    };
  }
  const loose = fallback.mapFromLegacy(key);
  if (loose) {
    return {
      canonical: loose,
      legacyValue: legacyStatus,
      confidence: "medium",
      warnings: ["Mapped via DefaultLegacyTripStatusMapper alias table"],
      isSafeForOperationalAction: true,
      isDisplayable: true,
    };
  }
  return {
    canonical: "unmapped",
    legacyValue: legacyStatus,
    confidence: "unknown",
    warnings: [`Unknown legacy status '${legacyStatus}' → unmapped (no nearest guess)`],
    isSafeForOperationalAction: false,
    isDisplayable: true,
  };
}
