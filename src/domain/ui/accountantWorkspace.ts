/**
 * Accountant dedicated finance workspace — presentation / routing only.
 * Does NOT change RBAC permission matrix.
 */

export const ACCOUNTANT_HOME_HREF = "/finance" as const;

/**
 * Sidebar order for role=accountant (Arabic daily workspace).
 * Order is authoritative — filterNavForAccountant preserves it.
 */
export const ACCOUNTANT_NAV_HREFS = [
  "/finance",
  "/finance/cash",
  "/settlements",
  "/finance/driver-wallets",
  "/finance/agents",
  "/finance/ledger",
  "/finance/reconciliation",
  "/reports",
  "/finance/exceptions",
] as const;

const ACCOUNTANT_NAV_SET = new Set<string>(ACCOUNTANT_NAV_HREFS);

const ACCOUNTANT_NAV_ORDER = new Map<string, number>(
  ACCOUNTANT_NAV_HREFS.map((href, index) => [href, index]),
);

export function isAccountantRole(role: string | null | undefined): boolean {
  return role === "accountant";
}

export function homeHrefForRole(role: string | null | undefined): string {
  return isAccountantRole(role) ? ACCOUNTANT_HOME_HREF : "/dashboard";
}

/** Paths an accountant may use in the finance workspace UI. */
export function isAccountantWorkspacePath(pathname: string): boolean {
  if (!pathname) return false;
  return (
    pathname === "/finance" ||
    pathname.startsWith("/finance/") ||
    pathname === "/settlements" ||
    pathname.startsWith("/settlements/") ||
    pathname === "/reports" ||
    pathname.startsWith("/reports/")
  );
}

export function filterNavForAccountant<T extends { href: string }>(
  items: readonly T[],
): T[] {
  return items
    .filter((item) => ACCOUNTANT_NAV_SET.has(item.href))
    .sort(
      (a, b) =>
        (ACCOUNTANT_NAV_ORDER.get(a.href) ?? 999) -
        (ACCOUNTANT_NAV_ORDER.get(b.href) ?? 999),
    );
}

/**
 * Active nav matching: `/finance` is exact-only so child routes
 * (`/finance/cash`, …) highlight their own item.
 */
export function isAccountantNavItemActive(
  pathname: string,
  href: string,
): boolean {
  if (href === "/finance") return pathname === "/finance";
  return pathname === href || pathname.startsWith(`${href}/`);
}
