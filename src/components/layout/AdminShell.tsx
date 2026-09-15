"use client";

import { useState, type ReactNode } from "react";
import { AuthGuard } from "@/components/guards/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ShadowBanner } from "@/components/shadow/ShadowBanner";
import { useI18n } from "@/i18n/I18nProvider";
import { resolveAdminNextUiMode } from "@/domain/ui/AdminNextUiMode";
import { adminUi } from "@/components/ui/adminUi";

/**
 * Shadow banner activation uses public-safe flags only.
 * Production read remains disabled by default — banner stays hidden.
 */
function readUiMode(): ReturnType<typeof resolveAdminNextUiMode> {
  const enabled =
    process.env.NEXT_PUBLIC_PRODUCTION_READ_ENABLED === "true" ||
    process.env.PRODUCTION_READ_ENABLED === "true";
  const mode =
    (process.env.NEXT_PUBLIC_PRODUCTION_READ_MODE as "disabled" | "shadow") ||
    (process.env.PRODUCTION_READ_MODE as "disabled" | "shadow") ||
    "disabled";
  const appEnv =
    process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV || "development";
  return resolveAdminNextUiMode({
    PRODUCTION_READ_ENABLED: enabled,
    PRODUCTION_READ_MODE: mode === "shadow" ? "shadow" : "disabled",
    APP_ENV: appEnv,
  });
}

export function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { dir, t } = useI18n();
  const uiMode = readUiMode();
  const shadowActive = uiMode === "production_shadow";
  const [navOpen, setNavOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-[var(--background)]" dir={dir}>
        <Sidebar
          shadowMode={shadowActive}
          mobileOpen={navOpen}
          onNavigate={() => setNavOpen(false)}
          onClose={() => setNavOpen(false)}
        />
        {navOpen ? (
          <button
            type="button"
            aria-label={t("closeMenu")}
            className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <ShadowBanner active={shadowActive} />
          <Header
            navOpen={navOpen}
            onToggleNav={() => setNavOpen((v) => !v)}
          />
          <main className="flex-1 px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
            <div className={adminUi.pageWidth}>
              <header className="mb-3 min-w-0 sm:mb-4">
                <h1
                  data-testid="page-title"
                  className="truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-[1.35rem]"
                >
                  {title}
                </h1>
                {description ? (
                  <p className={`mt-1 ${adminUi.secondaryText}`}>{description}</p>
                ) : null}
              </header>
              <div data-testid="content-area" className={adminUi.pageStack}>
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
