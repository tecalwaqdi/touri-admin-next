"use client";

import { useCallback, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ForbiddenState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { FinanceCountryFilterSelect } from "@/components/ui/FinanceCountryFilterSelect";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import type { ReportExportSourceModel } from "@/domain/finance/reporting/FinanceReportingTypes";
import { buildFinanceReportDisplayModel } from "@/features/finance/reportDisplayModel";
import {
  presentFinanceTerm,
  presentReportType,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";

const REPORT_TYPES: ReportExportSourceModel["reportType"][] = [
  "finance_dashboard",
  "country_finance",
  "agent_finance",
  "driver_finance",
  "settlement_summary",
  "reconciliation_indicators",
  "corrections_visibility",
];

export function ReportsPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [type, setType] = useState<ReportExportSourceModel["reportType"]>(
    "finance_dashboard",
  );
  const [countryId, setCountryId] = useState("SA");
  const [currencyCode, setCurrencyCode] = useState("SAR");
  const [exportMsg, setExportMsg] = useState<string>();
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () => `fr7-export:${type}:${countryId}:${currencyCode}`,
    [type, countryId, currencyCode],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams({
        type,
        countryId,
        currency: currencyCode,
      });
      const res = await apiFetch(`/api/finance/export?${qs}`, { signal });
      if (res.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!res.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      return (await res.json()) as ReportExportSourceModel;
    },
    [apiFetch, type, countryId, currencyCode, finLocale],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
  });

  const display = useMemo(
    () => (data ? buildFinanceReportDisplayModel(data, finLocale) : null),
    [data, finLocale],
  );

  const exportCsv = async () => {
    setExportMsg(undefined);
    const qs = new URLSearchParams({
      type,
      countryId,
      currency: currencyCode,
      format: "csv",
      locale: finLocale,
    });
    const res = await apiFetch(`/api/finance/export?${qs}`);
    if (!res.ok) {
      setExportMsg(presentFinanceTerm("financeForbidden", finLocale));
      return;
    }
    const text = await res.text();
    setExportMsg(
      `CSV (${Math.max(text.split("\n").length - 1, 0)})`,
    );
  };

  const source = resolveAdminDataSourceLabel({
    syntheticSource: data?.meta.synthetic === true,
    productionFirestore: data?.meta.synthetic === false,
  });

  return (
    <AdminShell title={t("reports")}>
      <PermissionGuard permission="reports:export">
        <Breadcrumb items={[{ label: t("reports") }]} />
        <div
          data-testid="fr7-source-badge"
          className="mb-4 inline-flex rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900"
        >
          {t("fr7Authoritative")}
        </div>
        <SourceLabelBadge testId="synthetic-badge" source={source} />
        {source.code === "production_pilot" ? (
          <p
            data-testid="reports-pilot-notice"
            className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"
          >
            {presentFinanceTerm("pilotNotice", finLocale)}
          </p>
        ) : null}
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="text-sm">
            {presentFinanceTerm("report", finLocale)}
            <select
              data-testid="report-type"
              className="mt-1 block rounded border px-2 py-1"
              value={type}
              onChange={(e) =>
                setType(e.target.value as ReportExportSourceModel["reportType"])
              }
            >
              {REPORT_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {presentReportType(rt, finLocale)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {presentFinanceTerm("country", finLocale)}
            <div className="mt-1">
              <FinanceCountryFilterSelect
                value={countryId}
                onChange={setCountryId}
                locale={locale}
                allowEmpty={false}
                testId="report-country"
                className="block rounded border px-2 py-1"
              />
            </div>
          </label>
          <label className="text-sm">
            {presentFinanceTerm("currency", finLocale)}
            <select
              data-testid="report-currency"
              className="mt-1 block rounded border px-2 py-1"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
            >
              <option value="SAR">SAR</option>
              <option value="AED">AED</option>
              <option value="EGP">EGP</option>
              <option value="KWD">KWD</option>
              <option value="JOD">JOD</option>
            </select>
          </label>
          <button
            type="button"
            data-testid="export-csv"
            className="self-end rounded bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => void exportCsv()}
          >
            {presentFinanceTerm("exportCsv", finLocale)}
          </button>
        </div>
        {exportMsg ? (
          <p data-testid="export-message" className="mb-2 text-sm text-emerald-700">
            {exportMsg}
          </p>
        ) : null}
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {forbidden ? (
          <ForbiddenState
            message={presentFinanceTerm("financeForbidden", finLocale)}
          />
        ) : null}
        {state === "error" && !forbidden ? (
          <UnavailableState message={error} />
        ) : null}
        {state === "empty" ? (
          <EmptyState
            message={presentFinanceTerm("noMatchingRecords", finLocale)}
          />
        ) : null}
        {display ? (
          <div
            data-testid="report-result"
            dir={locale === "ar" ? "rtl" : "ltr"}
            className="rounded-lg border bg-white p-4"
          >
            <h2
              data-testid="report-title"
              className="mb-2 text-lg font-semibold text-slate-900"
            >
              {display.title}
            </h2>
            <p className="mb-2 text-sm text-slate-600">
              {presentFinanceTerm("amount", finLocale)}: {display.totalAmountLabel}{" "}
              — {display.rowCount}
            </p>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-start">
                <tr>
                  {display.headers.map((h) => (
                    <th key={h} className="px-2 py-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {display.rows.map((row, idx) => (
                  <tr key={`r-${idx}-${row.metricKey}`} className="border-t">
                    <td className="px-2 py-1">{row.metricLabel}</td>
                    <td className="px-2 py-1 tabular-nums">{row.amountLabel}</td>
                    <td className="px-2 py-1">{row.currency}</td>
                    <td className="px-2 py-1">{row.availabilityLabel}</td>
                    <td className="px-2 py-1">{row.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {state === "error" && !forbidden ? (
          <button
            type="button"
            className="mt-3 rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
            onClick={reload}
          >
            {t("retry")}
          </button>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
