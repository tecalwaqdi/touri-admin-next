import { canAccess, hasPermission, isWithinScope } from "@/permissions/rbac";
import type { AccessScope, Permission } from "@/types/roles";
import type { ScopeResource } from "@/permissions/rbac";

export { canAccess, hasPermission, isWithinScope };
export type { ScopeResource };

export class AuthorizationError extends Error {
  readonly code: "FORBIDDEN" | "SCOPE_DENIED";

  constructor(message = "Forbidden", code: "FORBIDDEN" | "SCOPE_DENIED" = "FORBIDDEN") {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
  }
}

export function assertPermission(
  granted: Permission[],
  required: Permission,
): void {
  if (!hasPermission(granted, required)) {
    throw new AuthorizationError(`Missing permission: ${required}`);
  }
}

export function assertScope(scope: AccessScope, resource: ScopeResource): void {
  if (!isWithinScope(scope, resource)) {
    throw new AuthorizationError("Resource outside user scope", "SCOPE_DENIED");
  }
}

export function assertCanAccess(
  granted: Permission[],
  scope: AccessScope,
  required: Permission,
  resource?: ScopeResource,
): void {
  if (!canAccess(granted, scope, required, resource)) {
    throw new AuthorizationError(`Cannot access ${required}`);
  }
}
