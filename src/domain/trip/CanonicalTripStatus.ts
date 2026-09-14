import {
  CANONICAL_TRIP_STATUSES,
  type CanonicalTripStatus,
} from "@/types/trip";

export type LegacyTripStatusMapper = {
  mapFromLegacy(legacyStatus: string, sourceSystem: string): CanonicalTripStatus | null;
  listSupportedLegacyStatuses(sourceSystem: string): string[];
};

/**
 * Interface + stub mapper only. Not wired to production Legacy Firestore.
 */
export class DefaultLegacyTripStatusMapper implements LegacyTripStatusMapper {
  private readonly map: Record<string, CanonicalTripStatus> = {
    requested: "requested",
    waiting: "waiting_driver",
    waiting_driver: "waiting_driver",
    accepted: "accepted",
    en_route: "driver_en_route",
    driver_en_route: "driver_en_route",
    arrived: "arrived",
    started: "started",
    on_trip: "started",
    completed: "completed",
    done: "completed",
    cancelled: "cancelled_by_system",
    cancelled_by_customer: "cancelled_by_customer",
    cancelled_by_driver: "cancelled_by_driver",
    cancelled_by_system: "cancelled_by_system",
    dispute: "under_dispute",
    under_dispute: "under_dispute",
    refunded: "refunded",
  };

  mapFromLegacy(legacyStatus: string): CanonicalTripStatus | null {
    const key = legacyStatus.trim().toLowerCase();
    return this.map[key] ?? null;
  }

  listSupportedLegacyStatuses(): string[] {
    return Object.keys(this.map);
  }
}

export function isCanonicalTripStatus(value: string): value is CanonicalTripStatus {
  return (CANONICAL_TRIP_STATUSES as readonly string[]).includes(value);
}

export function assertCanonicalTripStatus(value: string): CanonicalTripStatus {
  if (!isCanonicalTripStatus(value)) {
    throw new Error(`Unknown canonical trip status: ${value}`);
  }
  return value;
}
