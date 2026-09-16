/**
 * Presentation-only ReportMoney formatting.
 * Does NOT compute totals, commissions, or currency conversions.
 * Missing/unknown/incomplete/policy_blocked never render as 0.
 */

import type {
  ReportMoney,
  ReportMoneyAvailability,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import {
  presentMoneyAvailability,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";

const UNAVAILABLE: ReadonlySet<ReportMoneyAvailability> = new Set([
  "missing",
  "unknown",
  "not_represented",
  "incomplete",
  "policy_blocked",
]);

export type FormattedReportMoney = {
  label: string;
  availability: ReportMoneyAvailability;
  isUnknown: boolean;
  currency: string | null;
  amountMinor: string | null;
};

import { formatMinorUnitsDisplay } from "@/domain/presentation/formatMinorUnitsDisplay";
export { formatMinorUnitsDisplay } from "@/domain/presentation/formatMinorUnitsDisplay";

export function formatReportMoney(
  money: ReportMoney,
  locale: FinanceLocale = "en",
): FormattedReportMoney {
  if (UNAVAILABLE.has(money.availability) || money.amountMinor == null) {
    return {
      label: presentMoneyAvailability(money.availability, locale),
      availability: money.availability,
      isUnknown: true,
      currency: money.currency,
      amountMinor: null,
    };
  }
  return {
    label: formatMinorUnitsDisplay(money.amountMinor, money.currency),
    availability: money.availability,
    isUnknown: false,
    currency: money.currency,
    amountMinor: money.amountMinor,
  };
}

/** Build a ReportMoney cell for an explicitly unavailable KPI (no invented zero). */
export function unavailableReportMoney(
  currency: string | null = null,
): ReportMoney {
  return {
    amountMinor: null,
    currency,
    availability: "not_represented",
    incompleteReasons: ["not_on_company_dashboard"],
  };
}
