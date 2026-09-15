/**
 * Locale-aware count formatting. Do NOT use for IDs / technical identifiers.
 */

import type { Locale } from "@/i18n/messages";

export function formatCount(
  value: number | null | undefined,
  locale: Locale,
  fallback = "—",
): string {
  if (value == null || Number.isNaN(value)) return fallback;
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar" : "en-US").format(value);
  } catch {
    return String(value);
  }
}

/** Never locale-format identifiers — return as-is. */
export function formatIdentifier(id: string | null | undefined, fallback = "—"): string {
  if (id == null || id === "") return fallback;
  return id;
}
