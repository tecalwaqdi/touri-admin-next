"use client";

import type { AggregateMetric } from "@/application/production-read/listDtos";
import type { Locale } from "@/i18n/messages";

const UNAVAILABLE = { en: "Unavailable", ar: "غير متاح" } as const;
const MISSING = { en: "Missing", ar: "مفقود" } as const;

export function formatAggregateMetric(
  metric: AggregateMetric | null | undefined,
  locale: Locale,
): string {
  if (!metric || metric.value == null) {
    if (metric?.availability === "missing") {
      return MISSING[locale];
    }
    return UNAVAILABLE[locale];
  }
  return String(metric.value);
}

export function AggregateMetricCell({
  metric,
  locale,
  testId,
}: {
  metric: AggregateMetric | null | undefined;
  locale: Locale;
  testId?: string;
}) {
  const text = formatAggregateMetric(metric, locale);
  const isUnavailable = metric?.value == null;
  return (
    <span
      data-testid={testId}
      data-accuracy={metric?.accuracy ?? "unavailable"}
      data-availability={metric?.availability ?? "unavailable"}
      className={isUnavailable ? "text-slate-400" : undefined}
      title={
        metric?.accuracy === "bounded_sample"
          ? locale === "ar"
            ? "عينة محدودة"
            : "Bounded sample"
          : metric?.accuracy === "exact"
            ? locale === "ar"
              ? "دقيق"
              : "Exact"
            : locale === "ar"
              ? "غير متاح"
              : "Unavailable"
      }
    >
      {text}
    </span>
  );
}

export function UnavailableText({
  locale,
  value,
}: {
  locale: Locale;
  value?: string | null;
}) {
  if (value == null || value === "") {
    return <span className="text-slate-400">{UNAVAILABLE[locale]}</span>;
  }
  return <>{value}</>;
}
