"use client";

import type { AggregateMetric } from "@/application/production-read/listDtos";
import type { Locale } from "@/i18n/messages";
import { formatCount } from "@/i18n/formatCount";
import { t } from "@/i18n/messages";

export function formatAggregateMetric(
  metric: AggregateMetric | null | undefined,
  locale: Locale,
): string {
  if (!metric || metric.value == null) {
    if (metric?.availability === "missing") {
      return t(locale, "missing");
    }
    return t(locale, "unavailable");
  }
  return formatCount(metric.value, locale);
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
          ? t(locale, "boundedSample")
          : metric?.accuracy === "exact"
            ? t(locale, "exact")
            : t(locale, "unavailable")
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
    return <span className="text-slate-400">{t(locale, "unavailable")}</span>;
  }
  return <>{value}</>;
}
