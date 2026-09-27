/**
 * Trip cancel write gates — GLOBAL ∧ PRODUCTION ∧ TRIP. Defaults FALSE.
 */

import {
  TripWriteError,
  type TripWriteFlagGate,
} from "@/application/controlled-writes/trips/TripWriteTypes";

export const TRIP_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE = false as const;

export function areTripProductionWritesEnabled(
  flags: TripWriteFlagGate,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === true &&
    flags.PRODUCTION_WRITE_ENABLED === true &&
    flags.TRIP_WRITE_ENABLED === true
  );
}

export function assertTripProductionWriteEnabled(
  flags: TripWriteFlagGate,
): void {
  if (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED !== true ||
    flags.PRODUCTION_WRITE_ENABLED !== true
  ) {
    throw new TripWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED and PRODUCTION_WRITE_ENABLED required",
    );
  }
  if (flags.TRIP_WRITE_ENABLED !== true) {
    throw new TripWriteError(
      "RESOURCE_WRITE_DISABLED",
      "TRIP_WRITE_ENABLED required",
    );
  }
}

export function snapshotTripWriteFlags(
  flags: TripWriteFlagGate,
): TripWriteFlagGate {
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: flags.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: flags.PRODUCTION_WRITE_ENABLED,
    TRIP_WRITE_ENABLED: flags.TRIP_WRITE_ENABLED,
  };
}
