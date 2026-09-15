import type { MessageKey } from "@/i18n/messages";

export type NavItem = {
  href: string;
  labelKey: MessageKey;
  permission?:
    | "drivers:read"
    | "trips:read"
    | "agents:read"
    | "customers:read"
    | "finance:read"
    | "audit:read"
    | "users:manage"
    | "reports:export";
  implemented: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", implemented: true },
  { href: "/trips", labelKey: "trips", permission: "trips:read", implemented: true },
  { href: "/drivers", labelKey: "drivers", permission: "drivers:read", implemented: true },
  { href: "/customers", labelKey: "customers", permission: "customers:read", implemented: true },
  { href: "/agents", labelKey: "agents", permission: "agents:read", implemented: true },
  { href: "/finance", labelKey: "finance", permission: "finance:read", implemented: true },
  { href: "/settlements", labelKey: "settlements", permission: "finance:read", implemented: true },
  { href: "/reports", labelKey: "reports", permission: "reports:export", implemented: true },
  { href: "/geography", labelKey: "geography", implemented: true },
  { href: "/support", labelKey: "support", permission: "customers:read", implemented: true },
  {
    href: "/notifications",
    labelKey: "notifications",
    permission: "drivers:read",
    implemented: true,
  },
  // Settings: NOT_APPLICABLE_BY_CURRENT_PRODUCT_CONTRACT — not in nav.
  { href: "/users", labelKey: "users", permission: "users:manage", implemented: true },
  {
    href: "/roles",
    labelKey: "rolesPermissions",
    permission: "users:manage",
    implemented: true,
  },
  { href: "/audit", labelKey: "audit", permission: "audit:read", implemented: true },
];
