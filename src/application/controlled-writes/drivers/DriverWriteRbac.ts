/**
 * Phase 5A — Server-side RBAC for Driver Controlled Writes.
 * Permission: drivers:approve (or explicit grant). Auditor never write. Unknown DENY.
 */

import { hasPermission } from "@/permissions/rbac";
import type { Permission, Role } from "@/types/roles";
import type {
  DriverControlledWriteAction,
  VerifiedDriverWriteActor,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";

export const DRIVER_WRITE_PERMISSION: Permission = "drivers:approve";

/** Roles intended to hold drivers:approve for Controlled Writes. */
export const DRIVER_WRITE_ALLOWED_ROLES: readonly Role[] = [
  "super_admin",
  "operations_manager",
  "country_admin",
] as const;

const NEVER_WRITE_ROLES: readonly Role[] = [
  "auditor",
  "reporting_viewer",
] as const;

export function actorMayWriteDrivers(
  actor: VerifiedDriverWriteActor,
  action: DriverControlledWriteAction,
): boolean {
  void action;
  if (!actor.uid?.trim()) return false;
  if (!actor.role) return false;
  if ((NEVER_WRITE_ROLES as readonly string[]).includes(actor.role)) {
    return false;
  }
  // Unknown / unlisted roles: deny unless they explicitly hold the permission
  // AND are in the planned write role set (fail closed for exotic roles).
  if (!(DRIVER_WRITE_ALLOWED_ROLES as readonly string[]).includes(actor.role)) {
    return false;
  }
  return hasPermission(actor.permissions, DRIVER_WRITE_PERMISSION);
}

export function assertDriverWriteRbac(
  actor: VerifiedDriverWriteActor,
  action: DriverControlledWriteAction,
): void {
  if (!actorMayWriteDrivers(actor, action)) {
    throw new DriverWriteError(
      "PERMISSION_DENIED",
      `Missing ${DRIVER_WRITE_PERMISSION} for driver.${action} (role=${actor.role})`,
    );
  }
}
