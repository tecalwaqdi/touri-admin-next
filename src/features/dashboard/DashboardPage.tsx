"use client";

import { useCallback, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { MetricCard } from "@/components/ui/MetricCard";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import type { DashboardMetrics } from "@/application/dashboard/DashboardService";
import type { FinanceDashboardSummary } from "@/domain/finance/reporting/FinanceReportingTypes";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import {
  kpiAccuracyHint,
  type DashboardOpsKpiKey,
} from "@/domain/dashboard/KpiAccuracy";

function metricDisplay(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

export function DashboardPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const { session } = useAuth();
  const canFinance = Boolean(
    session.user && hasPermission(session.user.permissions, "finance:read"),
  );
  const [countryId, setCountryId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");

  const opsKey = useMemo(
    () => `dash-ops:${countryId}:${currencyCode}`,
    [countryId, currencyCode],
  );
  const finKey = useMemo(
    () => `dash-fr7:${countryId}:${currencyCode}:${canFinance}`,
    [countryId, currencyCode, canFinance],
  );

  const opsFetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currencyCode) qs.set("currencyCode", currencyCode);
      const res = await apiFetch(`/api/dashboard?${qs}`, { signal });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return (await res.json()) as DashboardMetrics;
    },
    [apiFetch, countryId, currencyCode],
  );

  const finFetcher = useCallback(
    async (signal: AbortSignal) => {
      if (!canFinance) return null;
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currencyCode) qs.set("currency", currencyCode);
      const res = await apiFetch(`/api/finance/dashboard?${qs}`, { signal });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error("Failed to load FR7 finance summary");
      return (await res.json()) as FinanceDashboardSummary;
    },
    [apiFetch, canFinance, countryId, currencyCode],
  );

  const ops = useStableQuery({ queryKey: opsKey, fetcher: opsFetcher, debounceMs: 250 });
  const fin = useStableQuery({
    queryKey: finKey,
    fetcher: finFetcher,
    debounceMs: 250,
    enabled: canFinance,
  });

  const hintFor = (key: DashboardOpsKpiKey): string | undefined => {
    const meta = ops.data?.kpiAccuracy?.[key];
    if (meta) return kpiAccuracyHint(meta, locale);
    if (ops.data?.metricsAvailability === "bounded_sample") {
      return t("boundedSampleHint");
    }
    if (ops.data?.metricsAvailability === "unavailable") {
      return t("unavailable");
    }
    return undefined;
  };

  const sourceView = ops.data?.sourceLabel
    ? {
        label: normalizeSourceLabelCode(ops.data.sourceLabel.label),
        code: normalizeSourceLabelCode(ops.data.sourceLabel.label),
        en: ops.data.sourceLabel.en,
        ar: ops.data.sourceLabel.ar,
        synthetic: ops.data.sourceLabel.synthetic,
      }
    : resolveAdminDataSourceLabel({
        syntheticSource: ops.data?.synthetic === true,
        productionFirestore: ops.data?.synthetic === false,
        unavailable: ops.data?.metricsAvailability === "unavailable",
      });

  return (
    <AdminShell title={t("dashboard")}>
      <Breadcrumb items={[{ label: t("dashboard") }]} />
      <SourceLabelBadge testId="synthetic-badge" source={sourceView} />
      {ops.data?.sampleIncludesPilotOrTest ? (
        <p
          data-testid="dashboard-pilot-included"
          className="mb-3 text-sm text-amber-800"
        >
          {locale === "ar"
            ? "العينة تتضمن سجلات تجريبية/تشغيلية تجريبية — لم تُستبعد بصمت"
            : "Sample includes pilot/test records — not silently excluded"}
        </p>
      ) : null}
      <div data-testid="dashboard-filters" className="mb-4 flex flex-wrap gap-3">
        <label className="text-sm">
          {t("country")}
          <select
            className="mt-1 block rounded border px-2 py-1"
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
          >
            <option value="">All</option>
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
            className="mt-1 block rounded border px-2 py-1"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
          >
            <option value="">All</option>
            <option value="SAR">SAR</option>
            <option value="AED">AED</option>
            <option value="EGP">EGP</option>
            <option value="KWD">KWD</option>
            <option value="JOD">JOD</option>
          </select>
        </label>
      </div>

      {(ops.state === "loading" || ops.state === "idle") && !ops.data ? (
        <SkeletonBlock />
      ) : null}
      {ops.state === "error" ? (
        <ErrorState message={ops.error} onRetry={ops.reload} />
      ) : null}

      {ops.data ? (
        <div data-testid="dashboard-metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            testId="kpi-totalTrips"
            label={t("totalTrips")}
            value={metricDisplay(ops.data.totalTrips)}
            href={ops.data.drilldowns.trips}
            hint={hintFor("totalTrips")}
          />
          <MetricCard
            testId="kpi-completedTrips"
            label={t("completedTrips")}
            value={metricDisplay(ops.data.completedTrips)}
            href={ops.data.drilldowns.completedTrips}
            hint={hintFor("completedTrips")}
          />
          <MetricCard
            testId="kpi-cancelledTrips"
            label={t("cancelledTrips")}
            value={metricDisplay(ops.data.cancelledTrips)}
            hint={hintFor("cancelledTrips")}
          />
          <MetricCard
            testId="kpi-activeDrivers"
            label={t("activeDrivers")}
            value={metricDisplay(ops.data.activeDrivers)}
            href={ops.data.drilldowns.drivers}
            hint={hintFor("activeDrivers")}
          />
          <MetricCard
            testId="kpi-customers"
            label={t("customersCount")}
            value={metricDisplay(ops.data.customers)}
            hint={hintFor("customers")}
          />
          <MetricCard
            testId="kpi-pendingDrivers"
            label={t("pendingDrivers")}
            value={metricDisplay(ops.data.pendingDrivers)}
            hint={hintFor("pendingDrivers")}
          />
        </div>
      ) : null}

      {canFinance ? (
        <section className="mt-8" data-testid="dashboard-finance-section">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{t("finance")}</h2>
            <span className="text-xs font-semibold text-emerald-800">
              FR7 authoritative
            </span>
          </div>
          {(fin.state === "loading" || fin.state === "idle") && !fin.data ? (
            <SkeletonBlock rows={3} />
          ) : null}
          {fin.state === "error" ? (
            <ErrorState message={fin.error} onRetry={fin.reload} />
          ) : null}
          {fin.data ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                testId="dash-fr7-gross"
                label="Gross booking"
                value={<MoneyCell money={fin.data.company.grossBookingValue} />}
                href="/finance"
              />
              <MetricCard
                testId="dash-fr7-commission"
                label="Platform commission"
                value={<MoneyCell money={fin.data.company.platformCommission} />}
                href="/finance"
              />
              <MetricCard
                testId="dash-fr7-cash"
                label={t("cashCollected")}
                value={<MoneyCell money={fin.data.company.collectedCash} />}
                href="/finance"
              />
              <MetricCard
                testId="dash-fr7-online"
                label={t("onlineCollected")}
                value={<MoneyCell money={fin.data.company.electronicCardReceipts} />}
                href="/finance"
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </AdminShell>
  );
}
