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
  presentKpiValue,
  type DashboardOpsKpiKey,
} from "@/domain/dashboard/KpiAccuracy";
import {
  resolveDashboardPeriod,
  type DashboardPeriodPreset,
} from "@/domain/dashboard/DashboardPeriod";
import { formatCount } from "@/i18n/formatCount";
import { presentFinanceTerm } from "@/domain/presentation/financeTerminology";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";

function kpiTone(
  metaAccuracy: string | undefined,
  value: number | null | undefined,
): "default" | "unavailable" | "warning" {
  if (metaAccuracy === "incomplete") return "warning";
  if (metaAccuracy === "unavailable" || value == null) return "unavailable";
  return "default";
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
  const [periodPreset, setPeriodPreset] =
    useState<DashboardPeriodPreset>("last_30_days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [includeTestRecords, setIncludeTestRecords] = useState(false);

  const period = useMemo(
    () =>
      resolveDashboardPeriod(periodPreset, {
        fromUtc: customFrom ? new Date(customFrom).toISOString() : undefined,
        toUtc: customTo ? new Date(customTo).toISOString() : undefined,
      }),
    [periodPreset, customFrom, customTo],
  );

  const opsKey = useMemo(
    () =>
      `dash-ops:${countryId}:${currencyCode}:${period.preset}:${period.fromUtc ?? ""}:${period.toUtc ?? ""}:${includeTestRecords}`,
    [countryId, currencyCode, period, includeTestRecords],
  );
  const finKey = useMemo(
    () =>
      `dash-fr7:${countryId}:${currencyCode}:${period.preset}:${period.fromUtc ?? ""}:${period.toUtc ?? ""}:${canFinance}`,
    [countryId, currencyCode, period, canFinance],
  );

  const opsFetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currencyCode) qs.set("currencyCode", currencyCode);
      if (period.fromUtc) qs.set("from", period.fromUtc);
      if (period.toUtc) qs.set("to", period.toUtc);
      if (includeTestRecords) qs.set("includeTestRecords", "1");
      const res = await apiFetch(`/api/dashboard?${qs}`, { signal });
      if (!res.ok) throw new Error("Failed to load dashboard");
      return (await res.json()) as DashboardMetrics;
    },
    [apiFetch, countryId, currencyCode, period, includeTestRecords],
  );

  const finFetcher = useCallback(
    async (signal: AbortSignal) => {
      if (!canFinance) return null;
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currencyCode) qs.set("currency", currencyCode);
      if (period.fromUtc) qs.set("from", period.fromUtc);
      if (period.toUtc) qs.set("to", period.toUtc);
      const res = await apiFetch(`/api/finance/dashboard?${qs}`, { signal });
      if (res.status === 403) return null;
      if (!res.ok) throw new Error("Failed to load FR7 finance summary");
      return (await res.json()) as FinanceDashboardSummary;
    },
    [apiFetch, canFinance, countryId, currencyCode, period],
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
    if (
      ops.data?.metricsAvailability === "unavailable" ||
      ops.data?.metricsAvailability === "incomplete"
    ) {
      return t("unavailable");
    }
    return undefined;
  };

  const displayFor = (
    key: DashboardOpsKpiKey,
    value: number | null | undefined,
  ): string => {
    const meta = ops.data?.kpiAccuracy?.[key];
    return presentKpiValue(value, meta, locale, (n) => formatCount(n, locale));
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
        unavailable:
          ops.data?.metricsAvailability === "unavailable" ||
          ops.data?.metricsAvailability === "incomplete",
      });

  const financeIncomplete = Boolean(fin.data?.meta?.incompleteReasons?.length);

  const opsCards: Array<{
    key: DashboardOpsKpiKey;
    label: string;
    value: number | null | undefined;
    href?: string;
  }> = ops.data
    ? [
        {
          key: "totalTrips",
          label: t("totalTrips"),
          value: ops.data.totalTrips,
          href: ops.data.drilldowns.trips,
        },
        {
          key: "completedTrips",
          label: t("completedTrips"),
          value: ops.data.completedTrips,
          href: ops.data.drilldowns.completedTrips,
        },
        {
          key: "cancelledTrips",
          label: t("cancelledTrips"),
          value: ops.data.cancelledTrips,
        },
        {
          key: "activeTrips",
          label: t("activeTrips"),
          value: ops.data.activeTrips,
        },
        {
          key: "activeDrivers",
          label: t("activeDrivers"),
          value: ops.data.activeDrivers,
          href: ops.data.drilldowns.drivers,
        },
        {
          key: "pendingDrivers",
          label: t("pendingDrivers"),
          value: ops.data.pendingDrivers,
        },
        {
          key: "customers",
          label: t("customersCount"),
          value: ops.data.customers,
        },
        {
          key: "activeAgents",
          label: t("activeAgents"),
          value: ops.data.activeAgents,
          href: "/agents",
        },
        {
          key: "partners",
          label: t("partners"),
          value: ops.data.partners,
          href: "/partners",
        },
        {
          key: "fleet",
          label: t("fleet"),
          value: ops.data.fleet,
          href: "/fleet",
        },
        {
          key: "guides",
          label: t("guides"),
          value: ops.data.guides,
          href: "/guides",
        },
        {
          key: "supportOpen",
          label: t("supportOpen"),
          value: ops.data.supportOpen,
          href: "/support",
        },
        {
          key: "landmarks",
          label: t("landmarks"),
          value: ops.data.landmarks,
          href: "/geography",
        },
      ]
    : [];

  const moneyTone = (
    availability: string | undefined,
  ): "default" | "unavailable" | "warning" => {
    if (!availability || availability === "available") return "default";
    if (availability === "incomplete" || availability === "missing")
      return "warning";
    return "unavailable";
  };

  return (
    <AdminShell title={t("dashboard")}>
      <Breadcrumb items={[{ label: t("dashboard") }]} />
      <SourceLabelBadge testId="synthetic-badge" source={sourceView} />
      {ops.data?.sampleIncludesPilotOrTest && includeTestRecords ? (        <p
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
            data-testid="dashboard-currency-filter"
          >
            <option value="">{t("all")}</option>
            <option value="SAR">SAR</option>
            <option value="AED">AED</option>
            <option value="EGP">EGP</option>
            <option value="KWD">KWD</option>
            <option value="JOD">JOD</option>
          </select>
        </FilterField>
        <FilterField label={t("period")}>
          <select
            className={adminUi.filterControl}
            value={periodPreset}
            onChange={(e) =>
              setPeriodPreset(e.target.value as DashboardPeriodPreset)
            }
            data-testid="dashboard-period-filter"
          >
            <option value="today">{t("periodToday")}</option>
            <option value="last_7_days">{t("periodLast7")}</option>
            <option value="last_30_days">{t("periodLast30")}</option>
            <option value="this_month">{t("periodThisMonth")}</option>
            <option value="custom">{t("periodCustom")}</option>
            <option value="all">{t("periodAll")}</option>
          </select>
        </FilterField>
        {periodPreset === "custom" ? (
          <>
            <FilterField label={t("createdAt")}>
              <input
                type="date"
                className={adminUi.filterControl}
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                data-testid="dashboard-period-from"
              />
            </FilterField>
            <FilterField label={t("updatedAt")}>
              <input
                type="date"
                className={adminUi.filterControl}
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                data-testid="dashboard-period-to"
              />
            </FilterField>
          </>
        ) : null}
        <FilterField label={t("showTestRecords")}>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeTestRecords}
              onChange={(e) => setIncludeTestRecords(e.target.checked)}
              data-testid="dashboard-show-test-records"
            />
            <span>{t("showTestRecords")}</span>
          </label>
        </FilterField>
      </FilterBar>

      {(ops.state === "loading" || ops.state === "idle") && !ops.data ? (
        <SkeletonBlock />
      ) : null}
      {ops.state === "error" ? (
        <ErrorState message={ops.error} onRetry={ops.reload} />
      ) : null}

      {ops.data ? (
        <section className="space-y-2" data-testid="dashboard-operations-section">
          <h2 className={adminUi.sectionTitle}>{t("operationsSection")}</h2>
          <div
            data-testid="dashboard-metrics"
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {opsCards.map((card) => {
              const meta = ops.data?.kpiAccuracy?.[card.key];
              const tone = kpiTone(meta?.accuracy, card.value);
              return (
                <MetricCard
                  key={card.key}
                  testId={`kpi-${card.key}`}
                  label={card.label}
                  value={displayFor(card.key, card.value)}
                  href={card.href}
                  hint={hintFor(card.key)}
                  tone={tone}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {canFinance ? (
        <section className="space-y-2" data-testid="dashboard-finance-section">
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
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              <MetricCard
                testId="dash-fr7-gross"
                label={presentFinanceTerm("grossBookingValue", locale)}
                value={<MoneyCell money={fin.data.company.grossBookingValue} />}
                href="/finance"
                tone={moneyTone(fin.data.company.grossBookingValue.availability)}
                hint={
                  financeIncomplete ? t("financialIncomplete") : undefined
                }
              />
              <MetricCard
                testId="dash-fr7-commission"
                label={presentFinanceTerm("platformCommission", locale)}
                value={
                  <MoneyCell money={fin.data.company.platformCommission} />
                }
                href="/finance"
                tone={moneyTone(
                  fin.data.company.platformCommission.availability,
                )}
              />
              <MetricCard
                testId="dash-fr7-cash"
                label={t("cashCollected")}
                value={<MoneyCell money={fin.data.company.collectedCash} />}
                href="/finance"
                tone={moneyTone(fin.data.company.collectedCash.availability)}
              />
              <MetricCard
                testId="dash-fr7-settled"
                label={t("settledAmounts")}
                value={<MoneyCell money={fin.data.company.settled} />}
                href="/finance"
                tone={moneyTone(fin.data.company.settled.availability)}
              />
              <MetricCard
                testId="dash-fr7-outstanding"
                label={t("outstandingBalance")}
                value={<MoneyCell money={fin.data.company.outstanding} />}
                href="/finance"
                tone={moneyTone(fin.data.company.outstanding.availability)}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </AdminShell>
  );
}
