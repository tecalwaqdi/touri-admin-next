"use client";

import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";
import { presentRole } from "@/domain/presentation/rolePresentation";
import { LtrIsolate } from "@/components/i18n/LtrIsolate";

function resolvePublicAppEnv(): "development" | "staging" | "production" {
  const value = process.env.NEXT_PUBLIC_APP_ENV ?? "development";
  if (value === "staging" || value === "production") return value;
  return "development";
}

export function Header() {
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
      className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3"
    >
      <div className="flex items-center gap-3">
        <span
          data-testid="environment-badge"
          className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold tracking-wide text-amber-900"
        >
          {envLabel}
        </span>
        <span className="text-sm text-slate-500">{t("notifications")}: —</span>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">
          {t("locale")}
          <select
            data-testid="locale-switch"
            className="ms-2 rounded border border-slate-300 px-2 py-1"
            value={locale}
            aria-label={t("locale")}
            onChange={(e) => setLocale(e.target.value as "ar" | "en")}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        <div data-testid="user-menu" className="text-sm text-slate-700" aria-label={t("userMenu")}>
          <span className="font-medium">{session.user?.displayName}</span>
          {roleKey ? (
            <span className="ms-2 text-slate-400" title={roleKey} data-role-key={roleKey}>
              ({roleLabel})
            </span>
          ) : null}
          {session.user?.email ? (
            <LtrIsolate className="ms-2 hidden text-xs text-slate-400 sm:inline">
              {session.user.email}
            </LtrIsolate>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
        >
          {t("logout")}
        </button>
      </div>
    </header>
  );
}
