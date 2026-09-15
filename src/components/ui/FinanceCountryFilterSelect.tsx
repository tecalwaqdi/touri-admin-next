"use client";

import {
  buildFinanceCountryFilterOptions,
  countryOptionLabel,
  type FinanceCountryFilterOption,
} from "@/domain/geography/CountryOption";
import type { Locale } from "@/i18n/messages";

type Props = {
  value: string;
  onChange: (filterId: string) => void;
  locale: Locale;
  allLabel?: string;
  allowEmpty?: boolean;
  testId?: string;
  className?: string;
};

/** Country filter for FR7 surfaces — option value is ISO2 (exact match). */
export function FinanceCountryFilterSelect({
  value,
  onChange,
  locale,
  allLabel,
  allowEmpty = true,
  testId = "finance-country-filter",
  className = "rounded border border-slate-300 px-3 py-2 text-sm",
}: Props) {
  const opts = buildFinanceCountryFilterOptions();
  return (
    <select
      data-testid={testId}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowEmpty && allLabel ? <option value="">{allLabel}</option> : null}
      {opts.map((opt: FinanceCountryFilterOption) => (
        <option key={opt.filterId} value={opt.filterId}>
          {countryOptionLabel(
            {
              canonicalId: opt.filterId,
              displayNameAr: opt.displayNameAr,
              displayNameEn: opt.displayNameEn,
              currency: opt.currency,
              availability: "available",
            },
            locale,
          )}{" "}
          ({opt.filterId})
        </option>
      ))}
    </select>
  );
}
