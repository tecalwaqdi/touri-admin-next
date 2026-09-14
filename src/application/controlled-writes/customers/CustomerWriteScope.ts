/**
 * Phase 5C — Country scope for Customer Controlled Writes.
 * Uses canonical Customer country from snapshot — no country inference
 * (phone / language / GPS / email / trip history / address forbidden).
 *
 * Global: may manage operational Customer even when geographyNotRepresented
 * (countryScopeKind=not_represented|unknown|unmapped) if policy allows.
 * Country-scoped + not_represented/unknown/unmapped → SCOPE_DENIED.
 * Country-scoped: actor.countryIds must include snapshot.countryId.
 */

import { isWithinScope } from "@/permissions/rbac";
import type {
  CustomerWriteSnapshot,
  VerifiedCustomerWriteActor,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

const UNSCOPED_COUNTRY_KINDS = new Set([
  "not_represented",
  "unknown",
  "unmapped",
]);

export function assertCustomerWriteScope(
  actor: VerifiedCustomerWriteActor,
  snapshot: CustomerWriteSnapshot,
): void {
  if (actor.scope.type === "global") {
    // Global may proceed for mapped OR geography-not-represented operational customers.
    return;
  }

  if (UNSCOPED_COUNTRY_KINDS.has(snapshot.countryScopeKind)) {
    throw new CustomerWriteError(
      "SCOPE_DENIED",
      `Customer country ${snapshot.countryScopeKind} — country-scoped actors cannot mutate`,
    );
  }

  if (!snapshot.countryId?.trim()) {
    throw new CustomerWriteError(
      "SCOPE_DENIED",
      "Customer countryId missing — cannot authorize country-scoped write",
    );
  }

  const ok = isWithinScope(actor.scope, {
    countryId: snapshot.countryId,
  });

  if (!ok) {
    throw new CustomerWriteError(
      "SCOPE_DENIED",
      `Actor scope ${actor.scope.type} cannot mutate customer/${snapshot.customerId} in ${snapshot.countryId}`,
    );
  }
}
