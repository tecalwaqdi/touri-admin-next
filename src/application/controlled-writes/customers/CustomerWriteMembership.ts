/**
 * Phase 5C — Membership validation for Customer Controlled Writes (4A-7).
 * Prove operational Customer before write:
 *   candidate + positive evidence + no conflicting role.
 * Reject excludedNonCustomer, excludedUnknownIdentity, Driver, Agent,
 * SUPERADMIN, Finance, Country Admin, Partner, Transport, Tour Guide
 * → NOT_OPERATIONAL_CUSTOMER.
 * No write merely because user/{uid} exists.
 */

import type { CustomerWriteSnapshot } from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

const CONTAMINATING_ROLES = new Set([
  "driver",
  "agent",
  "super_admin",
  "finance",
  "country_admin",
  "partner",
  "transport",
  "tour_guide",
]);

/**
 * Returns true when snapshot proves operational Customer membership.
 */
export function isProvenOperationalCustomer(
  snapshot: CustomerWriteSnapshot,
): boolean {
  if (!snapshot.exists) return false;
  if (snapshot.excludedNonCustomer) return false;
  if (snapshot.excludedUnknownIdentity) return false;
  if (
    snapshot.mappingStatus === "excludedNonCustomer" ||
    snapshot.mappingStatus === "excludedUnknownIdentity"
  ) {
    return false;
  }
  if (CONTAMINATING_ROLES.has(snapshot.conflictingRole)) return false;
  if (!snapshot.isCustomerCandidate) return false;
  if (!snapshot.hasPositiveCustomerEvidence) return false;
  if (!snapshot.isOperationalCustomer) return false;
  return true;
}

/**
 * Assert operational Customer membership before any Controlled Write.
 */
export function assertOperationalCustomerMembership(
  snapshot: CustomerWriteSnapshot,
): void {
  if (!snapshot.exists) {
    throw new CustomerWriteError(
      "CUSTOMER_NOT_FOUND",
      `Customer ${snapshot.customerId} not found`,
    );
  }

  if (!isProvenOperationalCustomer(snapshot)) {
    const reason = snapshot.excludedNonCustomer
      ? "excludedNonCustomer"
      : snapshot.excludedUnknownIdentity
        ? "excludedUnknownIdentity"
        : CONTAMINATING_ROLES.has(snapshot.conflictingRole)
          ? `conflictingRole=${snapshot.conflictingRole}`
          : !snapshot.isCustomerCandidate
            ? "not_candidate"
            : !snapshot.hasPositiveCustomerEvidence
              ? "no_positive_evidence"
              : !snapshot.isOperationalCustomer
                ? "not_operational"
                : `mappingStatus=${snapshot.mappingStatus}`;
    throw new CustomerWriteError(
      "NOT_OPERATIONAL_CUSTOMER",
      `Customer ${snapshot.customerId} is not an operational Customer (${reason})`,
    );
  }
}
