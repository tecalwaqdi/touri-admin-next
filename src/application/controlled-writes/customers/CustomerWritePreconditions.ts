/**
 * Phase 5C — Preconditions / concurrency for Customer Controlled Writes.
 * Load via canonical Customer snapshot. No last-write-wins.
 * Membership (4A-7) + state machine + active-trip guard.
 * Prefer Firestore application/account state; Auth sync deferred.
 * No finance / wallet / trip auto-cancel.
 */

import type {
  CustomerControlledWriteCommand,
  CustomerWriteSnapshot,
  ProvenCustomerOperationalState,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";
import { resolveCustomerTransition } from "@/application/controlled-writes/customers/CustomerStateMachine";
import { assertOperationalCustomerMembership } from "@/application/controlled-writes/customers/CustomerWriteMembership";

export type CustomerWriteLoadPort = {
  loadForWrite(customerId: string): Promise<CustomerWriteSnapshot | null>;
};

/**
 * Validate existence, operational membership, expected state, token,
 * state machine, and active-trip guard for disable/block.
 */
export function evaluateCustomerWritePreconditions(
  command: CustomerControlledWriteCommand,
  snapshot: CustomerWriteSnapshot | null,
): {
  snapshot: CustomerWriteSnapshot;
  toState: ProvenCustomerOperationalState;
} {
  if (!snapshot || !snapshot.exists) {
    throw new CustomerWriteError(
      "CUSTOMER_NOT_FOUND",
      `Customer ${command.customerId} not found`,
    );
  }

  if (snapshot.customerId !== command.customerId) {
    throw new CustomerWriteError(
      "PRECONDITION_FAILED",
      "Loaded customerId does not match command.customerId",
    );
  }

  // Membership first — never write merely because user/{uid} exists
  assertOperationalCustomerMembership(snapshot);

  if (snapshot.operationalState !== command.expectedCurrentState) {
    throw new CustomerWriteError(
      "PRECONDITION_FAILED",
      `expectedCurrentState=${command.expectedCurrentState} observed=${snapshot.operationalState}`,
    );
  }

  if (snapshot.preconditionToken !== command.preconditionToken) {
    throw new CustomerWriteError(
      "PRECONDITION_FAILED",
      "preconditionToken mismatch (concurrency)",
    );
  }

  const transition = resolveCustomerTransition(
    command.action,
    snapshot.operationalState,
  );
  if (!transition.ok) {
    throw new CustomerWriteError(transition.code, transition.message);
  }

  // Active trip guard — prefer DENY; no auto-cancel trips
  if (command.action === "disable" || command.action === "block") {
    if (snapshot.tripState === "active") {
      throw new CustomerWriteError(
        "CUSTOMER_HAS_ACTIVE_TRIP",
        `Cannot ${command.action} customer with active trip (no cascade cancel)`,
      );
    }
  }

  // Reactivate: no recreate/restore deleted (state machine already denies)
  // Finance: no wallet/payment/refund fields on command surface

  return { snapshot, toState: transition.to };
}
