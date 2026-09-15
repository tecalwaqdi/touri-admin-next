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
  "/reports",
  "/geography",
  "/support",
  "/notifications",
  "/users",
  "/roles",
  "/audit",
] as const;

/** Settings only — not a product surface. */
export const DEFERRED_NAV_HREFS = ["/settings"] as const;

export const NAV_POLICY = {
  support: "visible" as const,
  settings: "hidden" as const,
  notifications: "visible" as const,
  reason:
    "Support and Notifications are Production RO surfaces. Settings is NOT_APPLICABLE_BY_CURRENT_PRODUCT_CONTRACT (no safe business-config surface).",
};
