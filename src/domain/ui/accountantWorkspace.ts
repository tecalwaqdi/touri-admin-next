/**
 * Accountant dedicated finance workspace — presentation / routing only.
 * Does NOT change RBAC permission matrix.
 */

export const ACCOUNTANT_HOME_HREF = "/finance" as const;

/** Primary sidebar hrefs for role=accountant (profile/logout live in Header). */
export const ACCOUNTANT_NAV_HREFS = [
  "/finance",
  "/settlements",
  "/finance/cash",
  "/finance/driver-wallets",
  "/finance/agents",
  "/finance/ledger",
  "/finance/reconciliation",
  "/finance/exceptions",
  "/reports",
] as const;

const ACCOUNTANT_NAV_SET = new Set<string>(ACCOUNTANT_NAV_HREFS);

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
  return items.filter((item) => ACCOUNTANT_NAV_SET.has(item.href));
}
