"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/components/guards/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ShadowBanner } from "@/components/shadow/ShadowBanner";
import { useI18n } from "@/i18n/I18nProvider";
import { resolveAdminNextUiMode } from "@/domain/ui/AdminNextUiMode";

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
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { dir } = useI18n();
  const uiMode = readUiMode();
  const shadowActive = uiMode === "production_shadow";

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-[var(--background)]" dir={dir}>
        <Sidebar shadowMode={shadowActive} />
        <div className="flex min-w-0 flex-1 flex-col">
          <ShadowBanner active={shadowActive} />
          <Header />
          <main className="flex-1 p-4 sm:p-6">
            <h1 data-testid="page-title" className="mb-4 text-2xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <div data-testid="content-area">{children}</div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
