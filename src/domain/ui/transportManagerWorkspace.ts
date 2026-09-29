/**
 * Transport company manager workspace — presentation / routing only.
 * Does NOT change RBAC permission matrix.
 */

export const TRANSPORT_MANAGER_HOME_HREF = "/fleet" as const;

export const TRANSPORT_MANAGER_NAV_HREFS = [
  "/fleet",
  "/drivers",
  "/trips",
] as const;

const TRANSPORT_MANAGER_NAV_SET = new Set<string>(TRANSPORT_MANAGER_NAV_HREFS);

export function isTransportManagerRole(
  role: string | null | undefined,
): boolean {
  return role === "transport_manager";
}

export function homeHrefForTransportManager(
  role: string | null | undefined,
): string {
  return isTransportManagerRole(role)
    ? TRANSPORT_MANAGER_HOME_HREF
    : "/dashboard";
}

export function filterNavForTransportManager<T extends { href: string }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => TRANSPORT_MANAGER_NAV_SET.has(item.href));
}

export function isTransportManagerWorkspacePath(pathname: string): boolean {
  if (!pathname) return false;
  return (
    pathname === "/fleet" ||
    pathname.startsWith("/fleet/") ||
    pathname === "/drivers" ||
    pathname.startsWith("/drivers/") ||
    pathname === "/trips" ||
    pathname.startsWith("/trips/")
  );
}
