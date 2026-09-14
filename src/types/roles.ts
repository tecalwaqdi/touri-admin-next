export const ROLES = [
  "super_admin",
  "operations_manager",
  "country_admin",
  "agent_user",
  "accountant",
  "finance_approver",
  "support_agent",
  "reporting_viewer",
  "auditor",
] as const;

export type Role = (typeof ROLES)[number];

export const SCOPES = ["global", "country", "city", "agent"] as const;
export type ScopeType = (typeof SCOPES)[number];

export type AccessScope = {
  type: ScopeType;
  countryIds?: string[];
  cityIds?: string[];
  agentIds?: string[];
};

export const PERMISSIONS = [
  "drivers:read",
  "drivers:read_pii",
  "drivers:approve",
  "trips:read",
  "agents:read",
  "agents:manage",
  "customers:read",
  "customers:read_pii",
  "customers:manage",
  /** view */
  "finance:read",
  /** prepare settlement / accounting snapshot */
  "settlements:create",
  "settlements:prepare",
  "settlements:approve",
  "settlements:execute",
  "settlements:reverse",
  "finance:adjust",
  "finance:adjust_approve",
  /** payout prepare / execute (separate from settlement execute) */
  "payouts:prepare",
  "payouts:execute",
  "reports:export",
  "users:manage",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
