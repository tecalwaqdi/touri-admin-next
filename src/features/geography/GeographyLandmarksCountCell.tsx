"use client";

import { AggregateMetricCell, UnavailableText } from "@/components/ui/AggregateMetricCell";
import type { GeographyCountMetric } from "@/application/geography/geographyListDtos";
import type { Locale } from "@/i18n/messages";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * Honest landmark count cell: missing ≠ 0.
 * Empty proven collection → «لا توجد معالم»; unavailable → unavailable copy.
 */
export function GeographyLandmarksCountCell({
  count,
  locale,
  testId,
}: {
  count: GeographyCountMetric | null | undefined;
  locale: Locale;
  testId?: string;
}) {
  const { t } = useI18n();
  if (!count || count.availability === "unavailable" || count.value == null) {
    return <UnavailableText locale={locale} />;
  }
  if (count.value === 0) {
    return (
      <span
        data-testid={testId}
        data-availability="available"
        data-accuracy={count.accuracy}
        className="text-slate-600"
      >
        {t("noLandmarks")}
      </span>
    );
  }
  return <AggregateMetricCell metric={count} locale={locale} testId={testId} />;
}
