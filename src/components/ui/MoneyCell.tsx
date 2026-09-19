"use client";

import type { ReportMoney } from "@/domain/finance/reporting/FinanceReportingTypes";
import { formatReportMoney } from "@/features/finance/formatReportMoney";
import { useI18n } from "@/i18n/I18nProvider";
import {
  presentMoneyAvailability,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";

/**
 * Presentation-only money cell.
 * Zero (available + amountMinor 0) → "0.00 CUR"
 * not_represented → "Not applicable" / "غير منطبق"
 * missing / incomplete → distinct incomplete/missing labels (never invent 0)
 */
export function MoneyCell({
  money,
  testId,
}: {
  money: ReportMoney;
  testId?: string;
}) {
  const { locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const formatted = formatReportMoney(money, finLocale);
  const availabilityHint = presentMoneyAvailability(
    formatted.availability,
    finLocale,
  );
  return (
    <span
      data-testid={testId ?? "money-cell"}
      data-availability={formatted.availability}
      data-unknown={formatted.isUnknown ? "true" : "false"}
      data-zero={
        !formatted.isUnknown && formatted.amountMinor === "0" ? "true" : "false"
      }
      className={
        formatted.isUnknown
          ? formatted.availability === "not_represented"
            ? "font-medium text-slate-500"
            : "font-medium text-amber-800"
          : "font-medium tabular-nums text-slate-900"
      }
      title={
        money.incompleteReasons.length
          ? `${availabilityHint}: ${money.incompleteReasons.join(", ")}`
          : availabilityHint
      }
    >
      {formatted.label}
    </span>
  );
}
