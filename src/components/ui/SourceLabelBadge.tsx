/**
 * Shared source-label badge for Admin Next pages.
 * Truthful: Production / Production+pilot / Synthetic(dev) / Unavailable.
 */

"use client";

import type { AdminDataSourceLabelView } from "@/domain/production-read/SourceLabel";

export function SourceLabelBadge(props: {
  source?: AdminDataSourceLabelView | null;
  /** Fallback when API omits source — prefer explicit unavailable over synthetic. */
  fallback?: AdminDataSourceLabelView;
  testId?: string;
}) {
  const view =
    props.source ??
    props.fallback ??
    ({
      label: "unavailable",
      code: "unavailable",
      en: "Unavailable",
      ar: "غير متاح",
      synthetic: false,
    } satisfies AdminDataSourceLabelView);

  const color =
    view.label === "production"
      ? "bg-emerald-100 text-emerald-900"
      : view.label === "production_pilot"
        ? "bg-amber-100 text-amber-950"
        : view.label === "synthetic"
          ? "bg-violet-100 text-violet-900"
          : "bg-slate-100 text-slate-800";

  return (
    <div
      data-testid={props.testId ?? "source-label-badge"}
      data-source-label={view.label}
      data-synthetic={view.synthetic ? "true" : "false"}
      className={`mb-4 inline-flex rounded-md px-3 py-1 text-sm font-semibold ${color}`}
    >
      {view.en} / {view.ar}
    </div>
  );
}
