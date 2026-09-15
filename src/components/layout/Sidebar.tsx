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

export function Sidebar({ shadowMode = false }: { shadowMode?: boolean }) {
  const pathname = usePathname();
  const { session } = useAuth();
  const { t } = useI18n();
  const user = session.user;

  const items = shadowMode
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

  return (
    <aside
      data-testid="sidebar"
      data-shadow-mode={shadowMode ? "true" : "false"}
      className="flex w-56 shrink-0 flex-col border-e border-slate-800 bg-slate-950 text-slate-100 sm:w-64"
    >
      <div className="border-b border-slate-800 px-4 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
          Touri Taxi
        </p>
        <p className="mt-1 text-lg font-semibold tracking-tight">{t("appName")}</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label={t("primaryNav")}>
        {items.map((item) => {
          if (
            shadowMode &&
            (SHADOW_HREF_HIDE as readonly string[]).includes(item.href)
          ) {
            return null;
          }
          if (item.permission && user && !hasPermission(user.permissions, item.permission)) {
            return null;
          }
          // No fake Coming Soon in production nav — hide unimplemented items.
          if (!item.implemented) {
            return null;
          }
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const label = t(item.labelKey);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${
                active ? "bg-[var(--brand)] text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
