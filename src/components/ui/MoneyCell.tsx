"use client";

import type { ReportMoney } from "@/domain/finance/reporting/FinanceReportingTypes";
import { formatReportMoney } from "@/features/finance/formatReportMoney";
import { useI18n } from "@/i18n/I18nProvider";
import type { FinanceLocale } from "@/domain/presentation/financeTerminology";

export function MoneyCell({
  money,
  testId,
}: {
  money: ReportMoney;
  testId?: string;
}) {
  const { locale } = useI18n();
  const formatted = formatReportMoney(money, locale as FinanceLocale);
  return (
    <span
      data-testid={testId ?? "money-cell"}
      data-availability={formatted.availability}
      data-unknown={formatted.isUnknown ? "true" : "false"}
      className={
        formatted.isUnknown
          ? "font-medium text-amber-800"
          : "font-medium tabular-nums text-slate-900"
      }
      title={
        money.incompleteReasons.length
          ? money.incompleteReasons.join(", ")
          : formatted.availability
      }
    >
      {formatted.label}
    </span>
  );
}
