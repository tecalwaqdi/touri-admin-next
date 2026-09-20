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
  const [countryId, setCountryId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [agentId, setAgentId] = useState("");
  const [driverId, setDriverId] = useState("");
  const includePilotRecords = false;
  const filtersReady = (type !== "country_finance" || !!countryId) && (type !== "agent_finance" || (!!agentId && !!countryId)) && (type !== "driver_finance" || !!driverId);
  const [exportMsg, setExportMsg] = useState<string>();
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () => `fr7-export:${type}:${countryId}:${currencyCode}:${agentId}:${driverId}:${includePilotRecords ? "1" : "0"}`,
    [type, countryId, currencyCode, agentId, driverId, includePilotRecords],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams({
        type,
        countryId,
        currency: currencyCode, agentId, driverId,
      });
      if (includePilotRecords) qs.set("includePilotRecords", "1");
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
    [apiFetch, type, countryId, currencyCode, agentId, driverId, includePilotRecords, finLocale],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    enabled: filtersReady,
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
      currency: currencyCode, agentId, driverId,
      format: "csv",
      locale: finLocale,
    });
    if (includePilotRecords) qs.set("includePilotRecords", "1");
    try {
    const res = await apiFetch(`/api/finance/export?${qs}`);
    if (!res.ok) {
      setExportMsg(presentFinanceTerm("financeForbidden", finLocale));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `touri-${type}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportMsg(finLocale === "ar" ? "تم تنزيل التقرير" : "Report downloaded");
    } catch { setExportMsg(presentFinanceTerm("dataUnavailable", finLocale)); }
  };

  const source = resolveAdminDataSourceLabel({
    containsPilotRecords: data?.meta.containsPilotRecords,
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
        {source.code === "production_pilot" || data?.meta.containsPilotRecords ? (
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
                allowEmpty allLabel={presentFinanceTerm("all", finLocale)}
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
              <option value="">{presentFinanceTerm("all", finLocale)}</option>
              <option value="KGS">KGS</option>
              <option value="SAR">SAR</option>
              <option value="AED">AED</option>
              <option value="EGP">EGP</option>
              <option value="KWD">KWD</option>
              <option value="JOD">JOD</option>
            </select>
          </label>
          {type === "agent_finance" || type === "driver_finance" ? (
            <label className="text-sm">{presentFinanceTerm(type === "agent_finance" ? "agentId" : "driverId", finLocale)}
              <input className="mt-1 block rounded border px-2 py-1" value={type === "agent_finance" ? agentId : driverId} onChange={e => type === "agent_finance" ? setAgentId(e.target.value.trim()) : setDriverId(e.target.value.trim())} />
            </label>
          ) : null}
          <button
            disabled={!filtersReady}
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
        {!filtersReady ? <p className="mb-3 text-sm">{finLocale === "ar" ? "حدد الدولة والطرف المطلوب لإظهار التقرير" : "Select the country and party required for this report"}</p> : null}
        {filtersReady && (state === "loading" || state === "idle") && !data ? (
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
        {display && filtersReady && state !== "error" && data?.reportType === type ? (
          <div
            data-testid="report-result"
            dir={locale === "ar" ? "rtl" : "ltr"}
            className="overflow-x-auto rounded-lg border bg-white p-4"
          >
            <h2
              data-testid="report-title"
              className="mb-2 text-lg font-semibold text-slate-900"
            >
              {display.title}
            </h2>
            <p className="mb-2 text-sm text-slate-600">
              {display.rowCount} {finLocale === "ar" ? "سجل" : "rows"}
            </p>
            {data?.meta.incompleteReasons.includes("bounded_financial_window") ? <p className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-950">{presentFinanceTerm("boundedWindow", finLocale)}</p> : null}
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-start">
                <tr>
                  {display.tableHeaders.map((h) => (
                    <th key={h} className="px-2 py-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {display.tableRows.map((row, idx) => (
                  <tr key={`r-${idx}`} className="border-t">
                    {row.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-1 tabular-nums">{cell}</td>)}
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
