"use client";

import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";

/**
 * Locale-controlled date field for accountant finance filters.
 * Native <input type="date"> placeholders follow the OS locale in Chromium,
 * so English UI still showed Arabic day/month/year chrome — use text + ISO
 * placeholders instead (values remain YYYY-MM-DD).
 */
export function FinanceLocaleDateInput({
  value,
  onChange,
  locale,
  testId,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  locale: string;
  testId?: string;
  className?: string;
}) {
  const finLocale = (locale === "ar" ? "ar" : "en") as FinanceLocale;
  const placeholder = presentFinanceTerm("datePlaceholder", finLocale);
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      lang={locale}
      dir="ltr"
      placeholder={placeholder}
      title={placeholder}
      pattern="\d{4}-\d{2}-\d{2}"
      data-testid={testId}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
