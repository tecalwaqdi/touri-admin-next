"use client";

import {
  financeTermTooltip,
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { useI18n } from "@/i18n/I18nProvider";

/** Business label + optional short tooltip for finance terms. */
export function FinanceTermLabel({
  termKey,
  className,
  testId,
}: {
  termKey: string;
  className?: string;
  testId?: string;
}) {
  const { locale } = useI18n();
  const label = presentFinanceTerm(termKey, locale as FinanceLocale);
  const tip = financeTermTooltip(termKey, locale as FinanceLocale);
  return (
    <span
      data-testid={testId ?? `finance-term-${termKey}`}
      data-finance-term={termKey}
      className={className}
      title={tip}
    >
      {label}
      {tip ? (
        <span
          className="ms-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700"
          aria-label={tip}
          title={tip}
        >
          ?
        </span>
      ) : null}
    </span>
  );
}
