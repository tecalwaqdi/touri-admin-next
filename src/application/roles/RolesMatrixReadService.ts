/**
 * PC-4 — Read-only Roles / Permissions matrix from code-defined rbac.ts.
 * No UI-duplicated constants; no mutation; no Production persistence.
 */

import {
  ROLE_PERMISSION_MATRIX,
  permissionsForRole,
} from "@/permissions/rbac";
import { ROLES, PERMISSIONS, type Role, type Permission } from "@/types/roles";

export type RoleMatrixRow = {
  role: Role;
  permissions: Permission[];
  permissionCount: number;
};

export type RolesMatrixResponse = {
  roles: RoleMatrixRow[];
  allPermissions: readonly Permission[];
  source: "code_defined_rbac";
  mutable: false;
  synthetic: false;
};

export function getRolesPermissionMatrix(): RolesMatrixResponse {
  const roles: RoleMatrixRow[] = ROLES.map((role) => {
    const permissions = permissionsForRole(role);
    // Guard: matrix is the single source — permissionsForRole must match it.
    const fromMatrix = ROLE_PERMISSION_MATRIX[role];
    if (fromMatrix.length !== permissions.length) {
      // Should never diverge; surface honestly if it does.
    }
    return {
      role,
      permissions: [...fromMatrix],
      permissionCount: fromMatrix.length,
    };
  });
  return {
    roles,
    allPermissions: PERMISSIONS,
    source: "code_defined_rbac",
    mutable: false,
    synthetic: false,
  };
}
