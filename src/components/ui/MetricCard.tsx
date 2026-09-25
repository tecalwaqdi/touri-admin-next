"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  href,
  testId,
  hint,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  href?: string;
  testId?: string;
  hint?: string;
  /** unavailable/incomplete are visually quieter than real KPIs. */
  tone?: "default" | "unavailable" | "warning";
}) {
  const shell =
    tone === "unavailable"
      ? "rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5"
      : tone === "warning"
        ? "rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5"
        : "rounded-md border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-emerald-300";

  const valueClass =
    tone === "unavailable"
      ? "mt-1 text-base font-medium text-slate-400"
      : tone === "warning"
        ? "mt-1 text-lg font-semibold tabular-nums tracking-tight text-amber-900"
        : "mt-1 text-lg font-semibold tabular-nums tracking-tight text-slate-900 sm:text-xl";

  const content = (
    <div data-testid={testId} data-tone={tone} className={shell}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
        {label}
      </div>
      <div className={valueClass}>{value}</div>
      {hint ? (
        <p
          className={
            tone === "unavailable"
              ? "mt-0.5 text-[11px] leading-snug text-slate-400"
              : "mt-0.5 text-[11px] leading-snug text-amber-800/90"
          }
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
    >
      {content}
    </Link>
  ) : (
    content
  );
}
