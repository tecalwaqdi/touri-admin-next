/**
 * Phase 5A — Country scope for Driver Controlled Writes.
 * Uses canonical Driver country from snapshot — no country inference.
 * not_represented / unknown / unmapped → SCOPE_DENIED for country-scoped actors
 * unless the actor has global scope.
 */

import { isWithinScope } from "@/permissions/rbac";
import type {
  DriverWriteSnapshot,
  VerifiedDriverWriteActor,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";

const UNSCOPED_COUNTRY_KINDS = new Set([
  "not_represented",
  "unknown",
  "unmapped",
]);

export function assertDriverWriteScope(
  actor: VerifiedDriverWriteActor,
  snapshot: DriverWriteSnapshot,
): void {
  if (actor.scope.type === "global") {
    return;
  }

  if (UNSCOPED_COUNTRY_KINDS.has(snapshot.countryScopeKind)) {
    throw new DriverWriteError(
      "SCOPE_DENIED",
      `Driver country ${snapshot.countryScopeKind} — country-scoped actors cannot mutate`,
    );
  }

  if (!snapshot.countryId?.trim()) {
    throw new DriverWriteError(
      "SCOPE_DENIED",
      "Driver countryId missing — cannot authorize country-scoped write",
    );
  }

  const ok = isWithinScope(actor.scope, {
    countryId: snapshot.countryId,
  });

  if (!ok) {
    throw new DriverWriteError(
      "SCOPE_DENIED",
      `Actor scope ${actor.scope.type} cannot mutate driver/${snapshot.driverId} in ${snapshot.countryId}`,
    );
  }
}
