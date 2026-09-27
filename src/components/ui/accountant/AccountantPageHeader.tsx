"use client";

import Link from "next/link";
import { adminUi } from "@/components/ui/adminUi";

type Crumb = { href?: string; label: string };

type Props = {
  title: string;
  subtitle?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  testId?: string;
};

export function AccountantPageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  testId = "accountant-page-header",
}: Props) {
  return (
    <header
      data-testid={testId}
      className="mb-4 flex flex-wrap items-start justify-between gap-3"
    >
      <div className="min-w-0 space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-1 text-xs text-slate-500"
          >
            {breadcrumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {c.href ? (
                  <Link href={c.href} className={adminUi.link}>
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-slate-700">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-3xl text-sm text-slate-600">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
