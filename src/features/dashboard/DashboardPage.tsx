"use client";

import { useCallback, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { MetricCard } from "@/components/ui/MetricCard";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import type { DashboardMetrics } from "@/application/dashboard/DashboardService";
import type { FinanceDashboardSummary } from "@/domain/finance/reporting/FinanceReportingTypes";

export function DashboardPage() {
  const { t } = useI18n();
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

  return (
    <AdminShell title={t("dashboard")}>
      <Breadcrumb items={[{ label: t("dashboard") }]} />
      <div
        data-testid="synthetic-badge"
        className="mb-4 inline-flex rounded-md bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-900"
      >
        {t("syntheticData")} / بيانات تجريبية
      </div>
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
          <MetricCard label={t("totalTrips")} value={ops.data.totalTrips} href={ops.data.drilldowns.trips} />
          <MetricCard
            label={t("completedTrips")}
            value={ops.data.completedTrips}
            href={ops.data.drilldowns.completedTrips}
          />
          <MetricCard label={t("cancelledTrips")} value={ops.data.cancelledTrips} />
          <MetricCard
            label={t("activeDrivers")}
            value={ops.data.activeDrivers}
            href={ops.data.drilldowns.drivers}
          />
          <MetricCard label={t("customersCount")} value={ops.data.customers} />
          <MetricCard label={t("pendingDrivers")} value={ops.data.pendingDrivers} />
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
