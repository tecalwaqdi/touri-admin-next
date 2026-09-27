import { isWithinScope } from "@/permissions/rbac";
import {
  TripWriteError,
  type TripWriteSnapshot,
  type VerifiedTripWriteActor,
} from "@/application/controlled-writes/trips/TripWriteTypes";

export function assertTripWriteScope(
  actor: VerifiedTripWriteActor,
  snapshot: TripWriteSnapshot,
): void {
  if (actor.scope.type === "global") return;

  if (!snapshot.countryId?.trim()) {
    throw new TripWriteError(
      "SCOPE_DENIED",
      "Trip countryId missing — cannot authorize country-scoped cancel",
    );
  }

  const ok = isWithinScope(actor.scope, { countryId: snapshot.countryId });
  if (!ok) {
    throw new TripWriteError(
      "SCOPE_DENIED",
      `Actor scope cannot cancel trip/${snapshot.tripId} in ${snapshot.countryId}`,
    );
  }
}
