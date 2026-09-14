/**
 * Presentation-only ReportMoney formatting.
 * Does NOT compute totals, commissions, or currency conversions.
 * Missing/unknown/incomplete/policy_blocked never render as 0.
 */

import type {
  ReportMoney,
  ReportMoneyAvailability,
} from "@/domain/finance/reporting/FinanceReportingTypes";

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

/** Format minor units for display only (no arithmetic). */
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

export function formatReportMoney(money: ReportMoney): FormattedReportMoney {
  if (UNAVAILABLE.has(money.availability) || money.amountMinor == null) {
    const labelByAvailability: Record<ReportMoneyAvailability, string> = {
      available: "—",
      missing: "Missing",
      unknown: "Unknown",
      not_represented: "Not represented",
      incomplete: "Incomplete",
      policy_blocked: "Policy blocked",
    };
    return {
      label: labelByAvailability[money.availability],
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
