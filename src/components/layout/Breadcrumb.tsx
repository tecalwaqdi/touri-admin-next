"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";

export function Breadcrumb({
  items,
}: {
  items: Array<{ href?: string; label: string }>;
}) {
  const { t } = useI18n();
  return (
    <nav
      data-testid="breadcrumb"
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500 sm:text-sm"
    >
      <Link
        href="/dashboard"
        className="rounded hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
      >
        {t("breadcrumbHome")}
      </Link>
      {items.map((item) => (
        <span key={item.label} className="inline-flex min-w-0 items-center gap-x-1">
          <span className="text-slate-300" aria-hidden>
            /
          </span>
          {item.href ? (
            <Link
              href={item.href}
              className="truncate rounded hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="truncate text-slate-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
