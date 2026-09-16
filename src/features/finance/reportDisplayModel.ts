/**
 * Presentation-only report display model.
 * Does not recalculate amounts — formats FR7 export rows for operators.
 */

import { presentStatus } from "@/domain/presentation/statusPresentation";
import { presentCorrectionKind, presentSettlementDirection } from "@/domain/presentation/financeTerminology";
import type { ReportExportSourceModel } from "@/domain/finance/reporting/FinanceReportingTypes";
import { formatMinorUnitsDisplay } from "@/features/finance/formatReportMoney";
import {
  presentFinanceTerm,
  presentMoneyAvailability,
  presentReportExportHeaders,
  presentReportType,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";

export type FinanceReportDisplayRow = {
  metricKey: string;
  metricLabel: string;
  amountLabel: string;
  currency: string;
  availabilityLabel: string;
  explanation: string;
};

export type FinanceReportDisplayModel = {
  title: string;
  headers: string[];
  rows: FinanceReportDisplayRow[];
  tableHeaders: string[];
  tableRows: string[][];
  /** Machine-safe minor total when present — never shown as primary UI amountMinor label. */
  totalAmountLabel: string;
  currencyCode: string | null;
  rowCount: number;
};

export function buildFinanceReportDisplayModel(
  model: ReportExportSourceModel,
  locale: FinanceLocale,
): FinanceReportDisplayModel {
  const metricIdx = model.headers.indexOf("metric");
  const amountIdx = model.headers.indexOf("amountMinor");
  const currencyIdx = model.headers.indexOf("currency");
  const availabilityIdx = model.headers.indexOf("availability");
  const incompleteIdx = model.headers.indexOf("incompleteReasons");

  const displayHeaders = [
    presentFinanceTerm("metric", locale),
    presentFinanceTerm("amount", locale),
    presentFinanceTerm("currency", locale),
    presentFinanceTerm("availability", locale),
    presentFinanceTerm("explanation", locale),
  ];

  const rows: FinanceReportDisplayRow[] = model.rows.map((row) => {
    const metricKey = metricIdx >= 0 ? (row[metricIdx] ?? "") : "";
    const amountMinor = amountIdx >= 0 ? (row[amountIdx] ?? "") : "";
    const currency = currencyIdx >= 0 ? (row[currencyIdx] ?? "") : "";
    const availability =
      availabilityIdx >= 0 ? (row[availabilityIdx] ?? "unknown") : "unknown";
    const incomplete =
      incompleteIdx >= 0 ? (row[incompleteIdx] ?? "") : "";

    const amountLabel =
      !amountMinor ||
      availability === "missing" ||
      availability === "unknown" ||
      availability === "incomplete" ||
      availability === "policy_blocked" ||
      availability === "not_represented"
        ? presentMoneyAvailability(availability || "unknown", locale)
        : formatMinorUnitsDisplay(amountMinor, currency || null);

    return {
      metricKey,
      metricLabel: presentFinanceTerm(metricKey, locale),
      amountLabel,
      currency: currency || "—",
      availabilityLabel: presentMoneyAvailability(
        availability || "unknown",
        locale,
      ),
      explanation: incomplete || "—",
    };
  });

  const totalAmountLabel =
    model.totalAmountMinor == null
      ? presentMoneyAvailability("incomplete", locale)
      : formatMinorUnitsDisplay(
          model.totalAmountMinor,
          model.currencyCode,
        );

  return {
    title: presentReportType(model.reportType, locale),
    headers: displayHeaders,
    rows,
    tableHeaders: model.headers.map(h => presentFinanceTerm(h === "amountMinor" ? "amount" : h === "paidConfirmedMinor" ? "confirmedPaid" : h === "outstandingMinor" ? "outstanding" : h, locale)),
    tableRows: metricIdx >= 0 && amountIdx >= 0
      ? rows.map(row => [row.metricLabel, row.amountLabel, row.currency, row.availabilityLabel, row.explanation === "—" ? "—" : presentFinanceTerm("financialIncomplete", locale)])
      : model.rows.map(row => model.headers.map((h, i) => {
          const value = row[i] ?? "";
          if (h.endsWith("Minor")) return formatMinorUnitsDisplay(value || null, row[currencyIdx] ?? null);
          if (h === "status") return presentStatus(value, locale);
          if (h === "direction") return presentSettlementDirection(value, locale);
          if (h === "kind") return presentCorrectionKind(value, locale);
          if (h === "metric") return presentFinanceTerm(value, locale);
          if (h === "incompleteReasons") return value ? presentFinanceTerm("financialIncomplete", locale) : "—";
          if (value === "true" || value === "false") return presentFinanceTerm(value === "true" ? "yes" : "no", locale);
          if (value === "unknown") return presentMoneyAvailability("unknown", locale);
          return value || "—";
        })),
    totalAmountLabel,
    currencyCode: model.currencyCode,
    rowCount: model.rows.length,
  };
}

export function localizeExportCsvHeaders(
  headers: string[],
  locale: FinanceLocale,
): string[] {
  return presentReportExportHeaders(headers, locale);
}
