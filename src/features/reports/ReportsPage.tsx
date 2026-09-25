import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { FinancePartyNameFilter } from "@/components/ui/FinancePartyNameFilter";
import { adminUi } from "@/components/ui/adminUi";

const REPORT_TYPES: ReportExportSourceModel["reportType"][] = [
  "finance_dashboard",
  "country_finance",
  "agent_finance",
  "driver_finance",
  "settlement_summary",
  "reconciliation_indicators",
  "corrections_visibility",
];

type ReportPresetId =
  | "daily"
  | "weekly"
  | "monthly"
  | "driver_statement"
  | "agent_statement"
  | "commission"
  | "vat"
  | "cash"
  | "outstanding"
  | "settlement"
  | "reconciliation";

const REPORT_PRESETS: ReadonlyArray<{
  id: ReportPresetId;
  labelKey: string;
  type: ReportExportSourceModel["reportType"];
  periodDays?: number;
}> = [
  { id: "daily", labelKey: "reportPresetDaily", type: "finance_dashboard", periodDays: 1 },
  { id: "weekly", labelKey: "reportPresetWeekly", type: "finance_dashboard", periodDays: 7 },
  { id: "monthly", labelKey: "reportPresetMonthly", type: "finance_dashboard", periodDays: 30 },
  { id: "driver_statement", labelKey: "reportPresetDriverStatement", type: "driver_finance" },
  { id: "agent_statement", labelKey: "reportPresetAgentStatement", type: "agent_finance" },
  { id: "commission", labelKey: "reportPresetCommission", type: "finance_dashboard" },
  { id: "vat", labelKey: "reportPresetVat", type: "finance_dashboard" },
  { id: "cash", labelKey: "reportPresetCash", type: "finance_dashboard" },
  { id: "outstanding", labelKey: "reportPresetOutstanding", type: "settlement_summary" },
  { id: "settlement", labelKey: "reportPresetSettlement", type: "settlement_summary" },
  { id: "reconciliation", labelKey: "reportPresetReconciliation", type: "reconciliation_indicators" },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function monthBounds(offsetMonths: number): { from: string; to: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths + 1, 0),
  );
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

type DatePresetId = "today" | "last7" | "this_month" | "prev_month" | "custom";

function applyDatePreset(id: DatePresetId): { from: string; to: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  switch (id) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: isoDaysAgo(7), to: today };
    case "this_month":
      return monthBounds(0);
    case "prev_month":
      return monthBounds(-1);
    default:
      return null;
  }
}
export function ReportsPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const searchParams = useSearchParams();
  const presetFromUrl = searchParams.get("preset") as ReportPresetId | null;
  const initialPreset = REPORT_PRESETS.find((p) => p.id === presetFromUrl);
  const [type, setType] = useState<ReportExportSourceModel["reportType"]>(
    initialPreset?.type ?? "finance_dashboard",
  );
  const [countryId, setCountryId] = useState(searchParams.get("countryId") ?? "");
  const [currencyCode, setCurrencyCode] = useState(searchParams.get("currency") ?? "");
  const [agentId, setAgentId] = useState(searchParams.get("agentId") ?? "");
  const [driverId, setDriverId] = useState(searchParams.get("driverId") ?? "");
  const [periodFrom, setPeriodFrom] = useState(() =>
    initialPreset?.periodDays ? isoDaysAgo(initialPreset.periodDays) : "",
  );
  const [periodTo, setPeriodTo] = useState(() =>
    initialPreset?.periodDays ? new Date().toISOString().slice(0, 10) : "",
  );
  const [datePreset, setDatePreset] = useState<DatePresetId>(
    initialPreset?.periodDays === 1
      ? "today"
      : initialPreset?.periodDays === 7
        ? "last7"
        : initialPreset?.periodDays === 30
          ? "this_month"
          : "custom",
  );
  const [activePresetId, setActivePresetId] = useState<ReportPresetId | null>(
    presetFromUrl && REPORT_PRESETS.some((p) => p.id === presetFromUrl)
      ? presetFromUrl
      : null,
  );
  const includePilotRecords = false;
  const filtersReady = (type !== "country_finance" || !!countryId) && (type !== "agent_finance" || (!!agentId && !!countryId)) && (type !== "driver_finance" || !!driverId);
  const [exportMsg, setExportMsg] = useState<string>();
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    const preset = REPORT_PRESETS.find((p) => p.id === searchParams.get("preset"));
    if (!preset) return;
    setType(preset.type);
    if (preset.periodDays) {
      setPeriodFrom(isoDaysAgo(preset.periodDays));
      setPeriodTo(new Date().toISOString().slice(0, 10));
    }
    const d = searchParams.get("driverId");
    const a = searchParams.get("agentId");
    const c = searchParams.get("countryId");
    if (d) setDriverId(d);
    if (a) setAgentId(a);
    if (c) setCountryId(c);
  }, [searchParams]);

  const queryKey = useMemo(
    () =>
      `fr7-export:${type}:${countryId}:${currencyCode}:${agentId}:${driverId}:${periodFrom}:${periodTo}:${includePilotRecords ? "1" : "0"}`,
    [type, countryId, currencyCode, agentId, driverId, periodFrom, periodTo, includePilotRecords],
  );

  const buildQs = useCallback(
    (extra?: Record<string, string>) => {
      const qs = new URLSearchParams({
        type,
        countryId,
        currency: currencyCode,
        agentId,
        driverId,
        ...extra,
      });
      if (periodFrom) qs.set("from", `${periodFrom}T00:00:00.000Z`);
      if (periodTo) qs.set("to", `${periodTo}T23:59:59.999Z`);
      if (includePilotRecords) qs.set("includePilotRecords", "1");
      return qs;
    },
    [type, countryId, currencyCode, agentId, driverId, periodFrom, periodTo, includePilotRecords],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = buildQs();
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
    [apiFetch, buildQs, finLocale],
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
    const qs = buildQs({ format: "csv", locale: finLocale });
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
        {source.code === "development_synthetic" || source.code === "unavailable" ? (
          <SourceLabelBadge testId="synthetic-badge" source={source} />
        ) : null}
        {data?.meta.includePilotRecords === true && data.meta.containsPilotRecords ? (
          <p
            data-testid="reports-pilot-notice"
            className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
          >
            {presentFinanceTerm("pilotNotice", finLocale)}
          </p>
        ) : null}
        <div
          data-testid="report-presets"
          className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          <p className="sm:col-span-2 lg:col-span-3 text-sm font-medium text-slate-800">
            {presentFinanceTerm("selectReportPreset", finLocale)}
          </p>
          {REPORT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`report-preset-${p.id}`}
              className={
                activePresetId === p.id
                  ? "rounded-md border border-emerald-500 bg-emerald-50 px-3 py-2 text-start text-sm text-emerald-950"
                  : "rounded-md border border-slate-200 bg-white px-3 py-2 text-start text-sm text-slate-800 hover:border-emerald-400"
              }
              onClick={() => {
                setActivePresetId(p.id);
                setType(p.type);
                if (p.periodDays) {
                  setPeriodFrom(isoDaysAgo(p.periodDays));
                  setPeriodTo(new Date().toISOString().slice(0, 10));
                  setDatePreset(
                    p.periodDays === 1
                      ? "today"
                      : p.periodDays === 7
                        ? "last7"
                        : "this_month",
                  );
                }
              }}
            >
              {presentFinanceTerm(p.labelKey, finLocale)}
            </button>
          ))}
        </div>
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
            {presentFinanceTerm("periodFrom", finLocale)}
            <div className="mt-1 flex flex-wrap gap-1">
              {(
                [
                  ["today", "reportToday"],
                  ["last7", "reportLast7Days"],
                  ["this_month", "reportThisMonth"],
                  ["prev_month", "reportPreviousMonth"],
                  ["custom", "reportCustomPeriod"],
                ] as const
              ).map(([id, labelKey]) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`report-date-preset-${id}`}
                  className={
                    datePreset === id
                      ? "rounded border border-emerald-600 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900"
                      : "rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                  }
                  onClick={() => {
                    setDatePreset(id);
                    const bounds = applyDatePreset(id);
                    if (bounds) {
                      setPeriodFrom(bounds.from);
                      setPeriodTo(bounds.to);
                    }
                  }}
                >
                  {presentFinanceTerm(labelKey, finLocale)}
                </button>
              ))}
            </div>
            <input
              data-testid="report-date-from"
              type="date"
              className={`${adminUi.filterControl} mt-1`}
              value={periodFrom}
              onChange={(e) => {
                setDatePreset("custom");
                setPeriodFrom(e.target.value);
              }}
            />
          </label>
          <label className="text-sm">
            {presentFinanceTerm("periodTo", finLocale)}
            <input
              data-testid="report-date-to"
              type="date"
              className={`${adminUi.filterControl} mt-1`}
              value={periodTo}
              onChange={(e) => {
                setDatePreset("custom");
                setPeriodTo(e.target.value);
              }}
            />
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
                className={adminUi.filterControl}
              />
            </div>
          </label>
          <label className="text-sm">
            {presentFinanceTerm("currency", finLocale)}
            <select
              data-testid="report-currency"
              className={`${adminUi.filterControl} mt-1`}
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
            >
              <option value="">{presentFinanceTerm("all", finLocale)}</option>
              <option value="SAR">SAR</option>
              <option value="AED">AED</option>
              <option value="EGP">EGP</option>
              <option value="KWD">KWD</option>
              <option value="JOD">JOD</option>
            </select>
          </label>
          <FinancePartyNameFilter
            partyType="agent"
            value={agentId}
            onChange={setAgentId}
            countryId={countryId || undefined}
            testId="report-agent"
            disabled={type === "driver_finance" || !countryId}
          />
          <FinancePartyNameFilter
            partyType="driver"
            value={driverId}
            onChange={setDriverId}
            countryId={countryId || undefined}
            testId="report-driver"
            disabled={type === "agent_finance"}
          />
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
            {data?.meta.incompleteReasons.includes("bounded_financial_window") ? (
              <p
                data-testid="reports-bounded-window"
                className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
              >
                {presentFinanceTerm("boundedWindow", finLocale)}
              </p>
            ) : null}
            {data?.meta.incompleteReasons.includes(
              "no_certified_accounting_snapshots",
            ) ? (
              <p
                data-testid="reports-no-snapshots"
                className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800"
              >
                {presentFinanceTerm("noCertifiedSnapshots", finLocale)}
              </p>
            ) : null}
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
