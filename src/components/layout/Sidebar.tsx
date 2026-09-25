"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/config/navigation";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { hasPermission } from "@/permissions/rbac";
import {
  SHADOW_HREF_ALLOW,
  SHADOW_HREF_HIDE,
} from "@/domain/ui/ShadowNav";
import { DEFERRED_NAV_HREFS } from "@/domain/ui/navPolicy";
import {
  filterNavForAccountant,
  isAccountantNavItemActive,
  isAccountantRole,
} from "@/domain/ui/accountantWorkspace";

export function Sidebar({
  shadowMode = false,
  mobileOpen = false,
  onNavigate,
  onClose,
}: {
  shadowMode?: boolean;
  mobileOpen?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { session } = useAuth();
  const { t } = useI18n();
  const user = session.user;
  const accountant = isAccountantRole(user?.role);

  const baseItems = shadowMode
    ? [
        ...NAV_ITEMS.filter((item) =>
          (SHADOW_HREF_ALLOW as readonly string[]).includes(item.href),
        ),
        {
          href: "/admin-next-health/mapping",
          labelKey: "mappingHealth" as const,
          implemented: true,
        },
      ]
    : NAV_ITEMS;

  const items = accountant
    ? filterNavForAccountant(baseItems)
    : baseItems;

  const deferred = new Set<string>(DEFERRED_NAV_HREFS);

  return (
    <aside
      id="admin-sidebar"
      data-testid="sidebar"
      data-shadow-mode={shadowMode ? "true" : "false"}
      data-mobile-open={mobileOpen ? "true" : "false"}
      className={`fixed inset-y-0 start-0 z-40 flex w-[var(--sidebar-w)] shrink-0 flex-col border-e border-slate-800 bg-slate-950 text-slate-100 transition-transform duration-200 lg:static lg:translate-x-0 ${
        mobileOpen
          ? "translate-x-0"
          : "ltr:-translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0"
      }`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 px-4 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Touri Taxi
          </p>
          <p className="mt-1 truncate text-base font-semibold tracking-tight">
            {accountant ? t("finance") : t("appName")}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label={t("closeMenu")}
            onClick={onClose}
          >
            ✕
          </button>
        ) : null}
      </div>
      <nav
        className="flex-1 space-y-0.5 overflow-y-auto p-3"
        aria-label={t("primaryNav")}
        data-testid={accountant ? "accountant-sidebar-nav" : "sidebar-nav"}
      >
        {items.map((item) => {
          if (deferred.has(item.href)) {
            return null;
          }
          if (
            shadowMode &&
            (SHADOW_HREF_HIDE as readonly string[]).includes(item.href)
          ) {
            return null;
          }
          if (
            item.permission &&
            user &&
            !hasPermission(user.permissions, item.permission)
          ) {
            return null;
          }
          if (!item.implemented) {
            return null;
          }
          const active = accountant
            ? isAccountantNavItemActive(pathname, item.href)
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const label = t(item.labelKey);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={label}
              data-testid={`nav-${item.href.replace(/\//g, "_")}`}
              onClick={onNavigate}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                active
                  ? "bg-[var(--brand)] text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
