"use client";

import { useCallback, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { MetricCard } from "@/components/ui/MetricCard";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { CountryFilterSelect } from "@/components/ui/CountryFilterSelect";
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
import { formatCount } from "@/i18n/formatCount";
import { presentFinanceTerm } from "@/domain/presentation/financeTerminology";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";

function metricDisplay(value: number | null | undefined, locale: "ar" | "en"): string {
  if (value == null) return "—";
  return formatCount(value, locale);
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
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {t("pilotIncludedNotice")}
        </p>
      ) : null}
      <FilterBar testId="dashboard-filters">
        <FilterField label={t("country")}>
          <CountryFilterSelect
            value={countryId}
            onChange={setCountryId}
            locale={locale}
            allLabel={t("allCountries")}
            testId="dashboard-country-filter"
            className={adminUi.filterControl}
          />
        </FilterField>
        <FilterField label={t("currency")}>
          <select
            className={adminUi.filterControl}
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
          >
            <option value="">{t("all")}</option>
            <option value="SAR">SAR</option>
            <option value="AED">AED</option>
            <option value="EGP">EGP</option>
            <option value="KWD">KWD</option>
            <option value="JOD">JOD</option>
          </select>
        </FilterField>
      </FilterBar>

      {(ops.state === "loading" || ops.state === "idle") && !ops.data ? (
        <SkeletonBlock />
      ) : null}
      {ops.state === "error" ? (
        <ErrorState message={ops.error} onRetry={ops.reload} />
      ) : null}

      {ops.data ? (
        <div
          data-testid="dashboard-metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        >
          <MetricCard
            testId="kpi-totalTrips"
            label={t("totalTrips")}
            value={metricDisplay(ops.data.totalTrips, locale)}
            href={ops.data.drilldowns.trips}
            hint={hintFor("totalTrips")}
          />
          <MetricCard
            testId="kpi-completedTrips"
            label={t("completedTrips")}
            value={metricDisplay(ops.data.completedTrips, locale)}
            href={ops.data.drilldowns.completedTrips}
            hint={hintFor("completedTrips")}
          />
          <MetricCard
            testId="kpi-cancelledTrips"
            label={t("cancelledTrips")}
            value={metricDisplay(ops.data.cancelledTrips, locale)}
            hint={hintFor("cancelledTrips")}
          />
          <MetricCard
            testId="kpi-activeDrivers"
            label={t("activeDrivers")}
            value={metricDisplay(ops.data.activeDrivers, locale)}
            href={ops.data.drilldowns.drivers}
            hint={hintFor("activeDrivers")}
          />
          <MetricCard
            testId="kpi-customers"
            label={t("customersCount")}
            value={metricDisplay(ops.data.customers, locale)}
            hint={hintFor("customers")}
          />
          <MetricCard
            testId="kpi-pendingDrivers"
            label={t("pendingDrivers")}
            value={metricDisplay(ops.data.pendingDrivers, locale)}
            hint={hintFor("pendingDrivers")}
          />
          <MetricCard
            testId="kpi-supportOpen"
            label={t("supportOpen")}
            value={metricDisplay(ops.data.supportOpen, locale)}
            href="/support"
            hint={hintFor("supportOpen")}
          />
          <MetricCard
            testId="kpi-partners"
            label={t("partners")}
            value={metricDisplay(ops.data.partners, locale)}
            href="/partners"
            hint={hintFor("partners")}
          />
          <MetricCard
            testId="kpi-guides"
            label={t("guides")}
            value={metricDisplay(ops.data.guides, locale)}
            href="/guides"
            hint={hintFor("guides")}
          />
          <MetricCard
            testId="kpi-fleet"
            label={t("fleet")}
            value={metricDisplay(ops.data.fleet, locale)}
            href="/fleet"
            hint={hintFor("fleet")}
          />
          <MetricCard
            testId="kpi-landmarks"
            label={t("landmarks")}
            value={metricDisplay(ops.data.landmarks, locale)}
            href="/geography"
            hint={hintFor("landmarks")}
          />
        </div>
      ) : null}

      {canFinance ? (
        <section className="space-y-3" data-testid="dashboard-finance-section">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={adminUi.sectionTitle}>{t("finance")}</h2>
            <span className={`${adminUi.badge} bg-emerald-100 text-emerald-900`}>
              {t("fr7Authoritative")}
            </span>
          </div>
          {(fin.state === "loading" || fin.state === "idle") && !fin.data ? (
            <SkeletonBlock rows={3} />
          ) : null}
          {fin.state === "error" ? (
            <ErrorState message={fin.error} onRetry={fin.reload} />
          ) : null}
          {fin.data ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                testId="dash-fr7-gross"
                label={presentFinanceTerm("grossBookingValue", locale)}
                value={<MoneyCell money={fin.data.company.grossBookingValue} />}
                href="/finance"
              />
              <MetricCard
                testId="dash-fr7-commission"
                label={presentFinanceTerm("platformCommission", locale)}
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
