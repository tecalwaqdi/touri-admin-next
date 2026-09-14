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
  label: string;
  value: ReactNode;
  href?: string;
  testId?: string;
  hint?: string;
}) {
  const content = (
    <div
      data-testid={testId}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
    >
      <p className="text-sm text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
