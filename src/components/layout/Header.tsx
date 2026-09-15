"use client";

import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { presentRole } from "@/domain/presentation/rolePresentation";
import { LtrIsolate } from "@/components/i18n/LtrIsolate";
import { adminUi } from "@/components/ui/adminUi";

function resolvePublicAppEnv(): "development" | "staging" | "production" {
  const value = process.env.NEXT_PUBLIC_APP_ENV ?? "development";
  if (value === "staging" || value === "production") return value;
  return "development";
}

export function Header({
  navOpen,
  onToggleNav,
}: {
  navOpen?: boolean;
  onToggleNav?: () => void;
}) {
  const { session, logout, setLocale } = useAuth();
  const { t, locale } = useI18n();
  const appEnv = resolvePublicAppEnv();
  const envLabel =
    appEnv === "production"
      ? t("production")
      : appEnv === "staging"
        ? t("staging")
        : t("development");
  const roleKey = session.user?.role;
  const roleLabel = roleKey
    ? presentRole(roleKey, locale === "ar" ? "ar" : "en")
    : "";

  return (
    <header
      data-testid="header"
      className="sticky top-0 z-20 flex h-[var(--shell-header-h)] items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:px-5 lg:px-6"
    >
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onToggleNav ? (
          <button
            type="button"
            data-testid="mobile-nav-toggle"
            aria-expanded={navOpen === true}
            aria-controls="admin-sidebar"
            aria-label={navOpen ? t("closeMenu") : t("openMenu")}
            className={`${adminUi.btnGhost} lg:hidden`}
            onClick={onToggleNav}
          >
            <span aria-hidden className="text-base font-semibold">
              {navOpen ? "✕" : "☰"}
            </span>
          </button>
        ) : null}
        <span
          data-testid="environment-badge"
          className={`${adminUi.badge} shrink-0 bg-amber-100 text-amber-950`}
        >
          {envLabel}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <label className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
          <span className="hidden sm:inline">{t("locale")}</span>
          <select
            data-testid="locale-switch"
            className={adminUi.filterControl}
            value={locale}
            aria-label={t("locale")}
            onChange={(e) => setLocale(e.target.value as "ar" | "en")}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        <div
          data-testid="user-menu"
          className="hidden min-w-0 max-w-[14rem] truncate text-sm text-slate-700 md:block"
          aria-label={t("userMenu")}
          title={
            [session.user?.displayName, roleLabel, session.user?.email]
              .filter(Boolean)
              .join(" · ")
          }
        >
          <span className="font-medium">{session.user?.displayName}</span>
          {roleKey ? (
            <span
              className="ms-2 text-slate-400"
              title={roleKey}
              data-role-key={roleKey}
            >
              ({roleLabel})
            </span>
          ) : null}
          {session.user?.email ? (
            <LtrIsolate className="ms-2 hidden text-xs text-slate-400 lg:inline">
              {session.user.email}
            </LtrIsolate>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className={adminUi.btnPrimary}
        >
          {t("logout")}
        </button>
      </div>
    </header>
  );
}
