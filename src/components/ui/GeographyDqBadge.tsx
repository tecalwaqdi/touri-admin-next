"use client";

import { presentGeographyDqSeverity, type GeographyDqSeverity } from "@/domain/geography/GeographyDataQuality";
import { useI18n } from "@/i18n/I18nProvider";

const TONE: Record<GeographyDqSeverity, string> = {
  INFO: "bg-slate-100 text-slate-800",
  WARNING: "bg-amber-100 text-amber-900",
  ERROR: "bg-orange-100 text-orange-900",
  INVARIANT_VIOLATION: "bg-red-100 text-red-900",
};

export function GeographyDqBadge({
  severity,
  testId,
}: {
  severity: GeographyDqSeverity | null | undefined;
  testId?: string;
}) {
  const { locale } = useI18n();
  if (!severity) {
    return (
      <span data-testid={testId ?? "dq-badge-none"} className="text-slate-400">
        —
      </span>
    );
  }
  const label = presentGeographyDqSeverity(
    severity,
    locale === "ar" ? "ar" : "en",
  );
  return (
    <span
      data-testid={testId ?? "dq-badge"}
      data-dq-severity={severity}
      title={`${severity}: ${label}`}
      className={`inline-flex max-w-[11rem] truncate rounded px-2 py-0.5 text-xs font-semibold leading-tight ${TONE[severity]}`}
    >
      {label}
    </span>
  );
}
