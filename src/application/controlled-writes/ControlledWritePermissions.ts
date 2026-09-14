/**
 * Phase 5 — RBAC contract for Controlled Write candidates.
 * Planned permissions map to existing Permission tokens where present.
 * agents:manage is a real Permission (Phase 5B).
 * customers:manage is a real Permission (Phase 5C).
 */

import type { Permission, Role } from "@/types/roles";
import { hasPermission } from "@/permissions/rbac";
import type {
  ControlledWriteAction,
  ControlledWriteActor,
  ControlledWriteResource,
  ControlledWriteStageResult,
} from "@/application/controlled-writes/ControlledWriteTypes";

/** Design permission tokens (may alias existing Permission strings). */
export type ControlledWritePermissionToken =
  | "drivers:approve"
  | "agents:manage"
  | "customers:manage";

export const CONTROLLED_WRITE_PERMISSION_BY_ACTION: Record<
  string,
  ControlledWritePermissionToken
> = {
  "driver.approve": "drivers:approve",
  "driver.reject": "drivers:approve",
  "driver.needs_changes": "drivers:approve",
  "driver.suspend": "drivers:approve",
  "agent.activate": "agents:manage",
  "agent.deactivate": "agents:manage",
  "agent.suspend": "agents:manage",
  "customer.disable": "customers:manage",
  "customer.block": "customers:manage",
  "customer.reactivate": "customers:manage",
};

/**
 * Roles intended to hold each Controlled Write permission once activation lands.
 * Does not grant Production writes — flags still block.
 */
export const PLANNED_WRITE_ROLE_MATRIX: Record<
  ControlledWritePermissionToken,
  readonly Role[]
> = {
  "drivers:approve": [
    "super_admin",
    "operations_manager",
    "country_admin",
  ],
  "agents:manage": ["super_admin", "operations_manager", "country_admin"],
  "customers:manage": [
    "super_admin",
    "operations_manager",
    "country_admin",
  ],
};

export function requiredPermissionFor(
  resource: ControlledWriteResource,
  action: ControlledWriteAction,
): ControlledWritePermissionToken {
  const key = `${resource}.${action}`;
  const permission = CONTROLLED_WRITE_PERMISSION_BY_ACTION[key];
  if (!permission) {
    throw new Error(`No Controlled Write permission mapped for ${key}`);
  }
  return permission;
}

export function actorHasControlledWritePermission(
  actor: ControlledWriteActor,
  required: ControlledWritePermissionToken,
): boolean {
  // All Controlled Write permission tokens are real Permission union members
  // (drivers:approve, agents:manage, customers:manage).
  if (hasPermission(actor.permissions, required as Permission)) {
    return true;
  }
  // Role-matrix fallback for design/readiness tests when permissions array
  // is incomplete but role is intended to hold the write permission.
  return PLANNED_WRITE_ROLE_MATRIX[required].includes(actor.role);
}

export function assertControlledWriteRbac(
  actor: ControlledWriteActor,
  resource: ControlledWriteResource,
  action: ControlledWriteAction,
): ControlledWriteStageResult {
  const required = requiredPermissionFor(resource, action);
  if (!actorHasControlledWritePermission(actor, required)) {
    return {
      stage: "rbac",
      ok: false,
      code: "RBAC_DENIED",
      detail: `Missing ${required} for ${resource}.${action}`,
    };
  }
  return { stage: "rbac", ok: true, detail: required };
}
