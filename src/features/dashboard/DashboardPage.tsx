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
  DASHBOARD_CORE_KPI_KEYS,
  DASHBOARD_EXTENDED_KPI_KEYS,
  kpiAccuracyHint,
  presentKpiValue,
  unavailableKpiMeta,
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

type DashPayload = DashboardMetrics & {
  error?: string;
  code?: string;
  dashboardGroup?: "core" | "extended" | "all";
};

function mergeOpsMetrics(
  core: DashPayload | null | undefined,
  extended: DashPayload | null | undefined,
): DashboardMetrics | null {
  if (!core && !extended) return null;
  const base = (core ?? extended)!;
  const other = core && extended ? (core === base ? extended : core) : null;
  const unavailable = unavailableKpiMeta();

  const pick = <K extends keyof DashboardMetrics>(
    key: K,
    fromCore: boolean,
  ): DashboardMetrics[K] => {
    const primary = fromCore ? core : extended;
    const fallback = fromCore ? extended : core;
    if (primary && key in primary && primary[key] !== undefined) {
      // For group responses, KPIs outside the group are null + unavailable —
      // prefer the group that owns the key when present.
      return primary[key];
    }
    return (fallback?.[key] ?? null) as DashboardMetrics[K];
  };

  const kpiAccuracy = { ...(base.kpiAccuracy ?? {}) } as NonNullable<
    DashboardMetrics["kpiAccuracy"]
  >;
  for (const key of DASHBOARD_CORE_KPI_KEYS) {
    if (core?.kpiAccuracy?.[key]) kpiAccuracy[key] = core.kpiAccuracy[key];
    else if (!core) kpiAccuracy[key] = unavailable;
  }
  for (const key of DASHBOARD_EXTENDED_KPI_KEYS) {
    if (extended?.kpiAccuracy?.[key])
      kpiAccuracy[key] = extended.kpiAccuracy[key];
    else if (!extended) kpiAccuracy[key] = unavailable;
  }

  return {
    ...base,
    ...(other ?? {}),
    totalTrips: pick("totalTrips", true),
    completedTrips: pick("completedTrips", true),
    cancelledTrips: pick("cancelledTrips", true),
    activeTrips: pick("activeTrips", true),
    activeDrivers: pick("activeDrivers", true),
    pendingDrivers: pick("pendingDrivers", true),
    customers: pick("customers", false),
    activeAgents: pick("activeAgents", false),
    partners: pick("partners", false),
    fleet: pick("fleet", false),
    guides: pick("guides", false),
    supportOpen: pick("supportOpen", false),
    landmarks: pick("landmarks", false),
    cashCollected: null,
    onlineCollected: null,
    platformCommission: null,
    kpiAccuracy,
    drilldowns: core?.drilldowns ?? extended?.drilldowns ?? base.drilldowns,
    sourceLabel: core?.sourceLabel ?? extended?.sourceLabel ?? base.sourceLabel,
    metricsAvailability:
      core?.metricsAvailability === "unavailable" &&
      extended?.metricsAvailability === "unavailable"
        ? "unavailable"
        : core?.metricsAvailability === "incomplete" ||
            extended?.metricsAvailability === "incomplete"
          ? "incomplete"
          : core?.metricsAvailability ??
            extended?.metricsAvailability ??
            base.metricsAvailability,
  };
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

  const filterKey = useMemo(
    () =>
      `${countryId}:${currencyCode}:${period.preset}:${period.fromUtc ?? ""}:${period.toUtc ?? ""}:${includeTestRecords}`,
    [countryId, currencyCode, period, includeTestRecords],
  );
  const coreKey = useMemo(() => `dash-ops-core:${filterKey}`, [filterKey]);
  const extKey = useMemo(() => `dash-ops-ext:${filterKey}`, [filterKey]);
  const finKey = useMemo(
    () =>
      `dash-fr7:${countryId}:${currencyCode}:${period.preset}:${period.fromUtc ?? ""}:${period.toUtc ?? ""}:${canFinance}`,
    [countryId, currencyCode, period, canFinance],
  );

  const buildOpsFetcher = useCallback(
    (group: "core" | "extended") =>
      async (signal: AbortSignal) => {
        const qs = new URLSearchParams();
        qs.set("group", group);
        if (countryId) qs.set("countryId", countryId);
        if (currencyCode) qs.set("currencyCode", currencyCode);
        if (period.fromUtc) qs.set("from", period.fromUtc);
        if (period.toUtc) qs.set("to", period.toUtc);
        if (includeTestRecords) qs.set("includeTestRecords", "1");
        const timeoutCtrl = new AbortController();
        const onParentAbort = () => timeoutCtrl.abort();
        signal.addEventListener("abort", onParentAbort);
        // Group budgets are ≤5s server-side; keep client abort above that.
        const timer = window.setTimeout(() => timeoutCtrl.abort(), 20_000);
        let res: Response;
        try {
          res = await apiFetch(`/api/dashboard?${qs}`, {
            signal: timeoutCtrl.signal,
          });
        } finally {
          window.clearTimeout(timer);
          signal.removeEventListener("abort", onParentAbort);
        }
        const body = (await res.json().catch(() => ({}))) as DashPayload;
        if (
          (res.status === 503 || res.ok) &&
          body &&
          typeof body === "object" &&
          "metricsAvailability" in body
        ) {
          return body;
        }
        if (!res.ok) {
          throw new Error(body.error ?? "Failed to load dashboard");
        }
        return body;
      },
    [apiFetch, countryId, currencyCode, period, includeTestRecords],
  );

  const coreFetcher = useCallback(
    (signal: AbortSignal) => buildOpsFetcher("core")(signal),
    [buildOpsFetcher],
  );
  const extFetcher = useCallback(
    (signal: AbortSignal) => buildOpsFetcher("extended")(signal),
    [buildOpsFetcher],
  );

  const finFetcher = useCallback(
    async (signal: AbortSignal) => {
      if (!canFinance) return null;
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currencyCode) qs.set("currency", currencyCode);
      if (period.fromUtc) qs.set("from", period.fromUtc);
      if (period.toUtc) qs.set("to", period.toUtc);
      const timeoutCtrl = new AbortController();
      const onParentAbort = () => timeoutCtrl.abort();
      signal.addEventListener("abort", onParentAbort);
      const timer = window.setTimeout(() => timeoutCtrl.abort(), 55_000);
      let res: Response;
      try {
        res = await apiFetch(`/api/finance/dashboard?${qs}`, {
          signal: timeoutCtrl.signal,
        });
      } finally {
        window.clearTimeout(timer);
        signal.removeEventListener("abort", onParentAbort);
      }
      if (res.status === 403) return null;
      if (!res.ok) throw new Error("Failed to load FR7 finance summary");
      return (await res.json()) as FinanceDashboardSummary;
    },
    [apiFetch, canFinance, countryId, currencyCode, period],
  );

  const core = useStableQuery({
    queryKey: coreKey,
    fetcher: coreFetcher,
    debounceMs: 250,
  });
  const extended = useStableQuery({
    queryKey: extKey,
    fetcher: extFetcher,
    debounceMs: 250,
  });
  const fin = useStableQuery({
    queryKey: finKey,
    fetcher: finFetcher,
    debounceMs: 250,
    enabled: canFinance,
  });

  const opsData = useMemo(
    () => mergeOpsMetrics(core.data, extended.data),
    [core.data, extended.data],
  );
  const coreLoading =
    (core.state === "loading" || core.state === "idle") && !core.data;
  const extLoading =
    (extended.state === "loading" || extended.state === "idle") &&
    !extended.data;
  const opsError =
    !opsData && (core.state === "error" || extended.state === "error")
      ? (core.error ?? extended.error)
      : null;

  const hintFor = (key: DashboardOpsKpiKey): string | undefined => {
    const meta = opsData?.kpiAccuracy?.[key];
    if (meta) return kpiAccuracyHint(meta, locale);
    if (opsData?.metricsAvailability === "bounded_sample") {
      return t("boundedSampleHint");
    }
    return undefined;
  };

  const displayFor = (
    key: DashboardOpsKpiKey,
    value: number | null | undefined,
  ): string => {
    const meta = opsData?.kpiAccuracy?.[key];
    return presentKpiValue(value, meta, locale, (n) => formatCount(n, locale));
  };

  const sourceView = !opsData
    ? null
    : opsData.sourceLabel
      ? {
          label: normalizeSourceLabelCode(opsData.sourceLabel.label),
          code: normalizeSourceLabelCode(opsData.sourceLabel.label),
          en: opsData.sourceLabel.en,
          ar: opsData.sourceLabel.ar,
          synthetic: opsData.sourceLabel.synthetic,
        }
      : resolveAdminDataSourceLabel({
          syntheticSource: opsData.synthetic === true,
          productionFirestore: opsData.synthetic === false,
          unavailable: opsData.metricsAvailability === "unavailable",
        });

  const financeIncomplete = Boolean(fin.data?.meta?.incompleteReasons?.length);

  const isCardLoading = (key: DashboardOpsKpiKey): boolean => {
    if ((DASHBOARD_CORE_KPI_KEYS as readonly string[]).includes(key))
      return coreLoading;
    if ((DASHBOARD_EXTENDED_KPI_KEYS as readonly string[]).includes(key))
      return extLoading;
    return false;
  };

  const opsCards: Array<{
    key: DashboardOpsKpiKey;
    label: string;
    value: number | null | undefined;
    href?: string;
  }> = [
    {
      key: "totalTrips",
      label: t("totalTrips"),
      value: opsData?.totalTrips,
      href: opsData?.drilldowns?.trips,
    },
    {
      key: "completedTrips",
      label: t("completedTrips"),
      value: opsData?.completedTrips,
      href: opsData?.drilldowns?.completedTrips,
    },
    {
      key: "cancelledTrips",
      label: t("cancelledTrips"),
      value: opsData?.cancelledTrips,
    },
    {
      key: "activeTrips",
      label: t("activeTrips"),
      value: opsData?.activeTrips,
    },
    {
      key: "activeDrivers",
      label: t("activeDrivers"),
      value: opsData?.activeDrivers,
      href: opsData?.drilldowns?.drivers,
    },
    {
      key: "pendingDrivers",
      label: t("pendingDrivers"),
      value: opsData?.pendingDrivers,
    },
    {
      key: "customers",
      label: t("customersCount"),
      value: opsData?.customers,
    },
    {
      key: "activeAgents",
      label: t("activeAgents"),
      value: opsData?.activeAgents,
      href: "/agents",
    },
    {
      key: "partners",
      label: t("partners"),
      value: opsData?.partners,
      href: "/partners",
    },
    {
      key: "fleet",
      label: t("fleet"),
      value: opsData?.fleet,
      href: "/fleet",
    },
    {
      key: "guides",
      label: t("guides"),
      value: opsData?.guides,
      href: "/guides",
    },
    {
      key: "supportOpen",
      label: t("supportOpen"),
      value: opsData?.supportOpen,
      href: "/support",
    },
    {
      key: "landmarks",
      label: t("landmarks"),
      value: opsData?.landmarks,
      href: "/geography",
    },
  ];

  const moneyTone = (
    availability: string | undefined,
  ): "default" | "unavailable" | "warning" => {
    if (!availability || availability === "available") return "default";
    if (availability === "incomplete" || availability === "missing")
      return "warning";
    return "unavailable";
  };

  const showOpsSection = Boolean(opsData) || coreLoading || extLoading;

  return (
    <AdminShell title={t("dashboard")}>
      <Breadcrumb items={[{ label: t("dashboard") }]} />
      {sourceView ? (
        <SourceLabelBadge testId="synthetic-badge" source={sourceView} />
      ) : coreLoading && extLoading ? (
        <p
          data-testid="dashboard-source-loading"
          className="text-sm text-slate-500"
          role="status"
        >
          {t("loading")}
        </p>
      ) : null}
      {opsData?.sampleIncludesPilotOrTest && includeTestRecords ? (
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

      {opsError ? (
        <ErrorState
          message={opsError}
          onRetry={() => {
            core.reload();
            extended.reload();
          }}
        />
      ) : null}

      {showOpsSection && !opsError ? (
        <section className="space-y-2" data-testid="dashboard-operations-section">
          <h2 className={adminUi.sectionTitle}>{t("operationsSection")}</h2>
          <div
            data-testid="dashboard-metrics"
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {opsCards.map((card) => {
              if (isCardLoading(card.key)) {
                return (
                  <div
                    key={card.key}
                    data-testid={`kpi-${card.key}-loading`}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="mb-3 h-3 w-24 animate-pulse rounded bg-slate-200" />
                    <div className="h-7 w-16 animate-pulse rounded bg-slate-100" />
                  </div>
                );
              }
              const meta = opsData?.kpiAccuracy?.[card.key];
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
