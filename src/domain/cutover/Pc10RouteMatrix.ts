/**
 * PC-10 Production route / API smoke matrix (read-only coverage list).
 * Used by tests + runbook — not a live harness.
 */

export const PC10_PRODUCTION_PAGE_ROUTES = [
  "/login",
  "/dashboard",
  "/trips",
  "/drivers",
  "/customers",
  "/agents",
  "/geography",
  "/finance",
  "/settlements",
  "/reports",
  "/users",
  "/roles",
  "/audit",
  "/support",
  "/settings",
] as const;

export const PC10_PRODUCTION_DETAIL_ROUTE_PATTERNS = [
  "/trips/[id]",
  "/drivers/[id]",
  "/customers/[id]",
  "/agents/[id]",
  "/geography/countries/[id]",
  "/geography/cities/[id]",
  "/geography/landmarks/[id]",
  "/settlements/[id]",
  "/users/[id]",
  "/audit/[id]",
] as const;

/** Unauthenticated expected: 401/403 (no bearer logging in smoke scripts). */
export const PC10_API_LIVE_CONTRACT_GET_ROUTES = [
  "/api/dashboard",
  "/api/trips",
  "/api/drivers",
  "/api/customers",
  "/api/agents",
  "/api/geography/countries",
  "/api/geography/cities",
  "/api/geography/landmarks",
  "/api/geography/data-quality",
  "/api/finance/dashboard",
  "/api/finance/settlements",
  "/api/finance/corrections",
  "/api/finance/reconciliation",
  "/api/users",
  "/api/roles",
  "/api/audit",
  "/api/auth/me",
] as const;

/** Mutation probes — must remain write-disabled in Production cutover. */
export const PC10_API_WRITE_PROBE_ROUTES = [
  "/api/drivers/__pc10_probe__/approve",
  "/api/drivers/__pc10_probe__/reject",
  "/api/drivers/__pc10_probe__/needs_changes",
  "/api/drivers/__pc10_probe__/suspend",
  "/api/agents/__pc10_probe__/activate",
  "/api/customers/__pc10_probe__/disable",
  "/api/settlements",
] as const;

export const PC10_DEFAULT_PRODUCTION_URL =
  "https://touri-admin-next.vercel.app" as const;
export const PC10_CUSTOM_PRODUCTION_URL =
  "https://admin-next.touri-taxi.com" as const;
export const PC10_VERCEL_PROJECT = "touri-admin-next" as const;
export const PC10_LEGACY_ADMIN_FALLBACK_URL =
  "https://tutorial-multi-language-70gx4j.web.app/admin/" as const;
