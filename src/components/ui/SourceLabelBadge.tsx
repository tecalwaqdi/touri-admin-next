/**
 * Shared source-label badge for Admin Next pages.
 * Truthful: Production / Production+pilot / Development synthetic / Unavailable.
 * Classification logic unchanged — presentation is locale-aware (PC-7).
 */

"use client";

import {
  normalizeSourceLabelCode,
  type AdminDataSourceLabelView,
} from "@/domain/production-read/SourceLabel";
import { useI18n } from "@/i18n/I18nProvider";

export function SourceLabelBadge(props: {
  source?: AdminDataSourceLabelView | null;
  /** Fallback when API omits source — prefer explicit unavailable over synthetic. */
  fallback?: AdminDataSourceLabelView;
  testId?: string;
}) {
  const { locale } = useI18n();
  const raw =
    props.source ??
    props.fallback ??
    ({
      label: "unavailable",
      code: "unavailable",
      en: "Source unavailable",
      ar: "المصدر غير متاح",
      synthetic: false,
    } satisfies AdminDataSourceLabelView);

  const label = normalizeSourceLabelCode(raw.label);
  const view: AdminDataSourceLabelView = {
    ...raw,
    label,
    code: label,
    synthetic: label === "development_synthetic" ? true : raw.synthetic,
  };

  const color =
    view.label === "production"
      ? "bg-emerald-100 text-emerald-900"
      : view.label === "production_pilot"
        ? "bg-amber-100 text-amber-950"
        : view.label === "development_synthetic"
          ? "bg-violet-100 text-violet-900"
          : "bg-slate-100 text-slate-800";

  const text = locale === "ar" ? view.ar : view.en;

  return (
    <div
      data-testid={props.testId ?? "source-label-badge"}
      data-source-label={view.label}
      data-synthetic={view.synthetic ? "true" : "false"}
      className={`mb-4 inline-flex rounded-md px-3 py-1 text-sm font-semibold ${color}`}
    >
      {text}
    </div>
  );
}
