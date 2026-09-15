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

/**
 * Format minor units for display only (no arithmetic / FX).
 * Canonical trust path for UI minor→major presentation.
 * Example: 1500 + SAR → "15.00 SAR"
 */
export function formatMinorUnitsDisplay(
  amountMinor: string | null,
  currency: string | null,
): string {
  if (amountMinor == null || amountMinor === "") {
    return "—";
  }
  const cur = currency ?? "";
  // Display grouping only — no FX or commission math.
  const negative = amountMinor.startsWith("-");
  const raw = negative ? amountMinor.slice(1) : amountMinor;
  if (!/^\d+$/.test(raw)) {
    return "—";
  }
  const padded = raw.padStart(3, "0");
  const whole = padded.slice(0, -2) || "0";
  const frac = padded.slice(-2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const signed = `${negative ? "-" : ""}${grouped}.${frac}`;
  return cur ? `${signed} ${cur}` : signed;
}

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
