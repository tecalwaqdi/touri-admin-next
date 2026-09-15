"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  href,
  testId,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  href?: string;
  testId?: string;
  hint?: string;
}) {
  const content = (
    <div
      data-testid={testId}
      className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-emerald-300 focus-within:border-emerald-400 sm:p-4"
    >
      <div className="text-xs font-medium text-slate-500 sm:text-sm">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-2xl">
        {value}
      </div>
      {hint ? (
        <p className="mt-1 text-xs leading-snug text-amber-800/90">{hint}</p>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">
      {content}
    </Link>
  ) : (
    content
  );
}
