"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/auth/AuthContext";
import { canAccess } from "@/permissions/rbac";
import type { Permission } from "@/types/roles";
import type { ScopeResource } from "@/permissions/rbac";
import { ForbiddenState } from "@/components/states/QueryStates";

export function PermissionGuard({
  permission,
  resource,
  children,
}: {
  permission: Permission;
  resource?: ScopeResource;
  children: ReactNode;
}) {
  const { session } = useAuth();
  const user = session.user;

  if (!user) {
    return <ForbiddenState />;
  }

  if (!canAccess(user.permissions, user.scope, permission, resource)) {
    return <ForbiddenState />;
  }

  return <>{children}</>;
}
