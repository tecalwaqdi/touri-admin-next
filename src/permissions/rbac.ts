import type { AccessScope, Permission, Role } from "@/types/roles";

const ALL: Permission[] = [
  "drivers:read",
  "drivers:read_pii",
  "drivers:approve",
  "trips:read",
  "agents:read",
  "agents:manage",
  "customers:read",
  "customers:read_pii",
  "customers:manage",
  "finance:read",
  "settlements:create",
  "settlements:prepare",
  "settlements:approve",
  "settlements:execute",
  "settlements:reverse",
  "finance:adjust",
  "finance:adjust_approve",
  "payouts:prepare",
  "payouts:execute",
  "reports:export",
  "users:manage",
  "audit:read",
];

/**
 * F6 / Controlled Finance Rollout RBAC.
 * Separate: view, prepare, approve, execute settlement, adjustment/reversal, payout, export.
 */
export const ROLE_PERMISSION_MATRIX: Record<Role, Permission[]> = {
  super_admin: ALL,
  operations_manager: [
    "drivers:read",
    "drivers:read_pii",
    "drivers:approve",
    "trips:read",
    "agents:read",
    "agents:manage",
    "customers:read",
    "customers:read_pii",
    "customers:manage",
    "finance:read",
    "settlements:execute",
    "payouts:prepare",
    "payouts:execute",
    "reports:export",
  ],
  country_admin: [
    "drivers:read",
    "drivers:read_pii",
    "drivers:approve",
    "trips:read",
    "agents:read",
    "agents:manage",
    "customers:read",
    "customers:read_pii",
    "customers:manage",
    "finance:read",
    "settlements:prepare",
    "settlements:create",
    "reports:export",
  ],
  agent_user: [
    "drivers:read",
    "trips:read",
    "agents:read",
    "customers:read",
    "finance:read",
  ],
  accountant: [
    // Finance least privilege: ledger/wallets, settlements, recon, corrections,
    // and finance operational history are all gated by finance:read — do NOT
    // add audit:read (that is global Admin CW audit for drivers/agents/users).
    "finance:read",
    "settlements:create",
    "settlements:prepare",
    "finance:adjust",
    "payouts:prepare",
    "trips:read",
    "customers:read",
    "reports:export",
  ],
  finance_approver: [
    "finance:read",
    "settlements:approve",
    "finance:adjust_approve",
    "trips:read",
    "customers:read",
    "reports:export",
  ],
  support_agent: [
    "drivers:read",
    "trips:read",
    "agents:read",
    "customers:read",
    "customers:read_pii",
  ],
  reporting_viewer: [
    "trips:read",
    "drivers:read",
    "agents:read",
    "customers:read",
    "finance:read",
    "reports:export",
  ],
  auditor: [
    "audit:read",
    "trips:read",
    "drivers:read",
    "agents:read",
    "customers:read",
    "finance:read",
  ],
};

export function permissionsForRole(role: Role): Permission[] {
  return [...(ROLE_PERMISSION_MATRIX[role] ?? [])];
}

export function hasPermission(
  granted: Permission[],
  required: Permission | Permission[],
): boolean {
  const needed = Array.isArray(required) ? required : [required];
  return needed.every((permission) => granted.includes(permission));
}

export type ScopeResource = {
  countryId?: string | null;
  cityId?: string | null;
  agentId?: string | null;
};

export function isWithinScope(scope: AccessScope, resource: ScopeResource): boolean {
  switch (scope.type) {
    case "global":
      return true;
    case "country": {
      if (!resource.countryId) return false;
      return (scope.countryIds ?? []).includes(resource.countryId);
    }
    case "city": {
      if (!resource.cityId) return false;
      return (scope.cityIds ?? []).includes(resource.cityId);
    }
    case "agent": {
      if (!resource.agentId) return false;
      return (scope.agentIds ?? []).includes(resource.agentId);
    }
    default:
      return false;
  }
}

export function canAccess(
  granted: Permission[],
  scope: AccessScope,
  required: Permission,
  resource?: ScopeResource,
): boolean {
  if (!hasPermission(granted, required)) return false;
  if (!resource) return true;
  return isWithinScope(scope, resource);
}
