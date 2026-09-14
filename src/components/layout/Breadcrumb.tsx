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
    <nav data-testid="breadcrumb" className="mb-4 text-sm text-slate-500">
      <Link href="/dashboard" className="hover:text-slate-800">
        {t("breadcrumbHome")}
      </Link>
      {items.map((item) => (
        <span key={item.label}>
          <span className="mx-2">/</span>
          {item.href ? (
            <Link href={item.href} className="hover:text-slate-800">
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
