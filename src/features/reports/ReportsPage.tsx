"use client";

import { useCallback, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { ErrorState, EmptyState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import type { ReportExportSourceModel } from "@/domain/finance/reporting/FinanceReportingTypes";

const REPORT_TYPES: ReportExportSourceModel["reportType"][] = [
  "finance_dashboard",
  "settlement_summary",
  "reconciliation_indicators",
  "corrections_visibility",
];

export function ReportsPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [type, setType] = useState<ReportExportSourceModel["reportType"]>(
    "finance_dashboard",
  );
  const [countryId, setCountryId] = useState("SA");
  const [currencyCode, setCurrencyCode] = useState("SAR");
  const [exportMsg, setExportMsg] = useState<string>();

  const queryKey = useMemo(
    () => `fr7-export:${type}:${countryId}:${currencyCode}`,
    [type, countryId, currencyCode],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams({
        type,
        countryId,
        currency: currencyCode,
      });
      const res = await apiFetch(`/api/finance/export?${qs}`, { signal });
      if (res.status === 403) throw new Error(t("forbidden"));
      if (!res.ok) throw new Error("Failed to load FR7 report");
      return (await res.json()) as ReportExportSourceModel;
    },
    [apiFetch, type, countryId, currencyCode, t],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
  });

  const exportCsv = async () => {
    setExportMsg(undefined);
    const qs = new URLSearchParams({
      type,
      countryId,
      currency: currencyCode,
      format: "csv",
    });
    const res = await apiFetch(`/api/finance/export?${qs}`);
    if (!res.ok) {
      setExportMsg(t("forbidden"));
      return;
    }
    const text = await res.text();
    setExportMsg(`CSV exported (${Math.max(text.split("\n").length - 1, 0)} data rows)`);
  };

  return (
    <AdminShell title={t("reports")}>
      <PermissionGuard permission="reports:export">
        <Breadcrumb items={[{ label: t("reports") }]} />
        <div
          data-testid="fr7-source-badge"
          className="mb-4 inline-flex rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900"
        >
          FR7 export source
        </div>
        <div
          data-testid="synthetic-badge"
          className="mb-4 ms-2 inline-flex rounded-md bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-900"
        >
          {t("syntheticData")} / بيانات تجريبية
        </div>
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="text-sm">
            Report
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
                  {rt}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Country
            <select
              data-testid="report-country"
              className="mt-1 block rounded border px-2 py-1"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
            >
              <option value="SA">SA</option>
              <option value="AE">AE</option>
              <option value="EG">EG</option>
              <option value="KW">KW</option>
              <option value="JO">JO</option>
            </select>
          </label>
          <label className="text-sm">
            Currency
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
            Export CSV
          </button>
        </div>
        {exportMsg ? (
          <p data-testid="export-message" className="mb-2 text-sm text-emerald-700">
            {exportMsg}
          </p>
        ) : null}
        {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {data ? (
          <div data-testid="report-result" className="rounded-lg border bg-white p-4">
            <p className="mb-2 text-sm text-slate-600">
              Total:{" "}
              {data.totalAmountMinor == null
                ? "Unknown / Incomplete"
                : `${data.totalAmountMinor} ${data.currencyCode ?? ""}`}{" "}
              — rows: {data.rows.length}
            </p>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  {data.headers.map((h) => (
                    <th key={h} className="px-2 py-1">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, idx) => (
                  <tr key={`r-${idx}-${row[0]}`} className="border-t">
                    {row.map((cell, cIdx) => (
                      <td key={`${idx}-${cIdx}`} className="px-2 py-1">
                        {cell === "" ? "—" : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
