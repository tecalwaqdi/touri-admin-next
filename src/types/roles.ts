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
  /** view — Finance dashboard, settlements, wallets/ledger, recon, corrections.
   * Also covers finance operational history (settlement payments, corrections,
   * recon indicators). Does NOT grant Admin Audit UI (`/audit` / admin_next_cw_audit);
   * that remains `audit:read` only. Finance FR `finance_audit_events` stay
   * finance-ops separate and are never merged into Admin Audit. */
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
  /**
   * Global Admin Next controlled-write audit (`/api/audit` → admin_next_cw_audit).
   * Includes drivers/agents/users CW events — NOT finance-scoped.
   * Accountants must use `finance:read` for finance history; never grant this
   * for finance-only least privilege.
   */
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
