/**
 * Centralized locale-aware date/time formatter (presentation only).
 * Uses UTC to avoid hydration mismatch between server/client locales/timezones.
 * Never mutates underlying timestamps.
 */

import type { Locale } from "@/i18n/messages";

export type DateTimeFormatStyle = "medium" | "short" | "date";

function localeTag(locale: Locale): string {
  return locale === "ar" ? "ar" : "en-GB";
}

/**
 * Format an ISO/Date value for Admin UI.
 * Returns fallback for null/invalid — never raw ISO by default.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  locale: Locale,
  options?: {
    style?: DateTimeFormatStyle;
    fallback?: string;
    /** Optional ISO retained for tooltip/diagnostics only. */
    includeIsoTitle?: boolean;
  },
): { text: string; iso: string | null } {
  const fallback = options?.fallback ?? (locale === "ar" ? "غير متاح" : "Unavailable");
  if (value == null || value === "") {
    return { text: fallback, iso: null };
  }
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return { text: fallback, iso: null };
  }
  const iso = date.toISOString();
  const style = options?.style ?? "medium";
  let text: string;
  try {
    if (style === "date") {
      text = new Intl.DateTimeFormat(localeTag(locale), {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date);
    } else if (style === "short") {
      text = new Intl.DateTimeFormat(localeTag(locale), {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date);
    } else {
      text = new Intl.DateTimeFormat(localeTag(locale), {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date);
    }
  } catch {
    text = fallback;
  }
  return { text, iso };
}

/** Convenience: text only. */
export function formatDateTimeText(
  value: string | Date | null | undefined,
  locale: Locale,
  fallback?: string,
): string {
  return formatDateTime(value, locale, { fallback }).text;
}
