import { hasPermission } from "@/permissions/rbac";
import type { Role } from "@/types/roles";
import {
  TripWriteError,
  type VerifiedTripWriteActor,
} from "@/application/controlled-writes/trips/TripWriteTypes";

export const TRIP_WRITE_ROLE_MATRIX: readonly Role[] = [
  "super_admin",
  "operations_manager",
  "country_admin",
  "support_agent",
] as const;

export function actorMayCancelTrips(actor: VerifiedTripWriteActor): boolean {
  if (hasPermission(actor.permissions, "trips:manage")) return true;
  return (TRIP_WRITE_ROLE_MATRIX as readonly Role[]).includes(actor.role);
}

export function assertTripWriteRbac(actor: VerifiedTripWriteActor): void {
  if (!actorMayCancelTrips(actor)) {
    throw new TripWriteError(
      "PERMISSION_DENIED",
      "Missing trips:manage for trip.cancel",
    );
  }
}
