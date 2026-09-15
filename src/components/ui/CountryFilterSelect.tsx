"use client";

import {
  buildCanonicalCountryOptions,
  countryOptionLabel,
  type CountryOption,
} from "@/domain/geography/CountryOption";
import type { Locale } from "@/i18n/messages";

type Props = {
  value: string;
  onChange: (canonicalId: string) => void;
  locale: Locale;
  allLabel: string;
  testId?: string;
  options?: CountryOption[];
  className?: string;
};

/**
 * Country filter using canonicalId as option value.
 * Display names are presentation-only.
 */
export function CountryFilterSelect({
  value,
  onChange,
  locale,
  allLabel,
  testId = "country-filter",
  options,
  className = "rounded border border-slate-300 px-3 py-2 text-sm",
}: Props) {
  const opts = options ?? buildCanonicalCountryOptions();
  return (
    <select
      data-testid={testId}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{allLabel}</option>
      {opts.map((opt) => (
        <option key={opt.canonicalId} value={opt.canonicalId}>
          {countryOptionLabel(opt, locale)}
        </option>
      ))}
    </select>
  );
}
