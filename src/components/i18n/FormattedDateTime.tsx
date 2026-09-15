"use client";

import { formatDateTime } from "@/i18n/formatDateTime";
import { useI18n } from "@/i18n/I18nProvider";
import { LtrIsolate } from "@/components/i18n/LtrIsolate";

/**
 * Client-only date display — avoids SSR/CSR hydration mismatch
 * by formatting only inside the client component tree.
 */
export function FormattedDateTime({
  value,
  fallback,
  className,
  showIsoTitle = true,
}: {
  value: string | Date | null | undefined;
  fallback?: string;
  className?: string;
  showIsoTitle?: boolean;
}) {
  const { locale } = useI18n();
  const { text, iso } = formatDateTime(value, locale, { fallback });

  return (
    <LtrIsolate
      className={className}
      title={showIsoTitle && iso ? iso : undefined}
    >
      {text}
    </LtrIsolate>
  );
}
