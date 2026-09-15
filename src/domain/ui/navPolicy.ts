/**
 * Production navigation policy (PC-8).
 *
 * Only useful, implemented read surfaces appear in the sidebar.
 * Support / Settings / Notifications are intentionally deferred and must not
 * appear as dead nav links or empty placeholders.
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
  "/users",
  "/roles",
  "/audit",
] as const;

export const DEFERRED_NAV_HREFS = [
  "/support",
  "/settings",
] as const;

export const NAV_POLICY = {
  support: "hidden" as const,
  settings: "hidden" as const,
  notifications: "hidden" as const,
  reason:
    "No product-ready Support, Settings, or Notifications surface exists yet. Routes remain reachable only by direct URL and show a deferred state — not in Production nav.",
};
