/**
 * Production navigation policy.
 * Support + Notifications are implemented RO surfaces.
 * Settings remains intentionally absent (NOT_APPLICABLE product contract).
 */

export const PRODUCTION_NAV_HREFS = [
  "/dashboard",
  "/trips",
  "/drivers",
  "/customers",
  "/agents",
  "/finance",
  "/settlements",
  "/finance/cash",
  "/finance/driver-wallets",
  "/finance/agents",
  "/finance/ledger",
  "/finance/reconciliation",
  "/finance/exceptions",
  "/reports",
  "/geography",
  "/vehicle-catalog",
  "/partners",
  "/fleet",
  "/guides",
  "/support",
  "/notifications",
  "/users",
  "/roles",
  "/audit",
] as const;

/** Implemented drill-down routes (not primary sidebar). */
export const P1_DRILLDOWN_HREFS = [
  "/drivers/create",
  "/drivers/expiry",
  "/finance/periods",
  "/finance/driver-wallets",
] as const;

/** Settings only — not a product surface. */
export const DEFERRED_NAV_HREFS = ["/settings"] as const;

export const NAV_POLICY = {
  support: "visible" as const,
  settings: "hidden" as const,
  notifications: "visible" as const,
  reason:
    "Support and Notifications include gated write chrome (default OFF). Settings is NOT_APPLICABLE_BY_CURRENT_PRODUCT_CONTRACT.",
};
