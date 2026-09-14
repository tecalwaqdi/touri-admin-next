/**
 * Phase 5C — Server-side RBAC for Customer Controlled Writes.
 * Permission: customers:manage.
 * Suggested: super_admin, operations_manager; country_admin only own country
 * (scope enforced separately). agent_user has no automatic block powers.
 * support / auditor denied unless explicitly granted customers:manage AND
 * listed in allowed roles (Phase 5C: not listed → DENY).
 * Unknown DENY.
 */

import { hasPermission } from "@/permissions/rbac";
import type { Permission, Role } from "@/types/roles";
import type {
  CustomerControlledWriteAction,
  VerifiedCustomerWriteActor,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

export const CUSTOMER_WRITE_PERMISSION: Permission = "customers:manage";

/** Roles intended to hold customers:manage for Controlled Writes. */
export const CUSTOMER_WRITE_ALLOWED_ROLES: readonly Role[] = [
  "super_admin",
  "operations_manager",
  "country_admin",
] as const;

const NEVER_WRITE_ROLES: readonly Role[] = [
  "auditor",
  "reporting_viewer",
  "agent_user",
  "support_agent",
  "accountant",
  "finance_approver",
] as const;

export function actorMayWriteCustomers(
  actor: VerifiedCustomerWriteActor,
  action: CustomerControlledWriteAction,
): boolean {
  void action;
  if (!actor.uid?.trim()) return false;
  if (!actor.role) return false;
  // agent_user / support / auditor / finance: hard deny
  if ((NEVER_WRITE_ROLES as readonly string[]).includes(actor.role)) {
    return false;
  }
  if (!(CUSTOMER_WRITE_ALLOWED_ROLES as readonly string[]).includes(actor.role)) {
    return false;
  }
  return hasPermission(actor.permissions, CUSTOMER_WRITE_PERMISSION);
}

export function assertCustomerWriteRbac(
  actor: VerifiedCustomerWriteActor,
  action: CustomerControlledWriteAction,
): void {
  if (!actorMayWriteCustomers(actor, action)) {
    throw new CustomerWriteError(
      "PERMISSION_DENIED",
      `Missing ${CUSTOMER_WRITE_PERMISSION} for customer.${action} (role=${actor.role})`,
    );
  }
}
