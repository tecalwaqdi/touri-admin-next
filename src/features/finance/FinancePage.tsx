"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ForbiddenState,
  IncompleteState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FinanceCountryFilterSelect } from "@/components/ui/FinanceCountryFilterSelect";
import { FinanceTermLabel } from "@/components/ui/FinanceTermLabel";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/auth/AuthContext";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import { isAccountantRole } from "@/domain/ui/accountantWorkspace";
import type {
  AgentFinanceMetrics,
  CompanyFinanceMetrics,
  CountryFinanceSummary,
  FinanceDashboardSummary,
  ReconciliationIndicatorReadModel,
  CorrectionVisibilityItem,
  ReportMoney,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import {
  presentCorrectionKind,
  presentFinanceTerm,
  presentMoneyAvailability,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import {
  formatMinorUnitsDisplay,
  unavailableReportMoney,
} from "@/features/finance/formatReportMoney";

type MetricGroup = {
  id: string;
  titleKey: string;
  keys: Array<keyof CompanyFinanceMetrics>;
  /** Extra non-company KPIs shown as unavailable (honest — not invented). */
  unavailableExtras?: string[];
};

/** Full ops/finance groups — non-accountant. */
const DASHBOARD_GROUPS: MetricGroup[] = [
  {
    id: "business-volume",
    titleKey: "businessVolume",
    keys: ["grossBookingValue", "eligibleRevenue"],
  },
  {
    id: "company-revenue",
    titleKey: "companyRevenue",
    keys: [
      "platformCommission",
      "companyAllocation",
      "vatTax",
      "gatewayFees",
      "collectedCash",
      "electronicCardReceipts",
    ],
  },
  {
    id: "driver-position",
    titleKey: "driverPosition",
    keys: [],
    unavailableExtras: ["grossEarnings", "deductions", "driverNet"],
  },
  {
    id: "settlements",
    titleKey: "settlementsSection",
    keys: [
      "settled",
      "outstanding",
      "receivables",
      "payables",
      "disputedSuspense",
      "netRecognizedPosition",
    ],
  },
  {
    id: "corrections",
    titleKey: "correctionsSection",
    keys: ["adjustmentsMonetary", "refunds", "chargebacks", "reversals"],
  },
];

/** Accountant workspace — finance-relevant KPIs only (no QA/legacy mix). */
const ACCOUNTANT_MONEY_KEYS: Array<keyof CompanyFinanceMetrics> = [
  "grossBookingValue",
  "platformCommission",
  "vatTax",
  "settled",
  "outstanding",
];

const AGENT_KEYS: Array<keyof AgentFinanceMetrics> = [
  "collectedCash",
  "companyAmountDue",
  "agentEntitlement",
  "adjustments",
  "settlementsDue",
  "paid",
  "outstanding",
  "disputed",
];

export function FinancePage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const accountant = isAccountantRole(session.user?.role);
  const isSuperAdmin = session.user?.role === "super_admin";
  const [countryId, setCountryId] = useState("");
  const [currency, setCurrency] = useState("");
  const [agentId, setAgentId] = useState("");
  const includePilotRecords = false;
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () => `fr7-dash:${countryId}:${currency}:${agentId}:${includePilotRecords ? "1" : "0"}`,
    [countryId, currency, agentId, includePilotRecords],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currency) qs.set("currency", currency);
      if (includePilotRecords) qs.set("includePilotRecords", "1");
      const [dashRes, reconRes, corrRes] = await Promise.all([
        apiFetch(`/api/finance/dashboard?${qs}`, { signal }),
        apiFetch(`/api/finance/reconciliation?${qs}`, { signal }),
        apiFetch(`/api/finance/corrections?${qs}`, { signal }),
      ]);
      if (dashRes.status === 403 || reconRes.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!dashRes.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      const dashboard = (await dashRes.json()) as FinanceDashboardSummary;
      const reconciliation = reconRes.ok
        ? ((await reconRes.json()) as ReconciliationIndicatorReadModel)
        : null;
      const corrections = corrRes.ok
        ? (((await corrRes.json()) as { items: CorrectionVisibilityItem[] })
            .items ?? [])
        : [];

      let countrySummary: CountryFinanceSummary | null = null;
      let agentMetrics: AgentFinanceMetrics | null = null;
      if (countryId) {
        const cRes = await apiFetch(
          `/api/finance/countries/${encodeURIComponent(countryId)}?${qs}`,
          { signal },
        );
        if (cRes.ok) {
          countrySummary = (await cRes.json()) as CountryFinanceSummary;
        }
      }
      if (countryId && agentId.trim()) {
        const aQs = new URLSearchParams(qs);
        aQs.set("countryId", countryId);
        const aRes = await apiFetch(
          `/api/finance/agents/${encodeURIComponent(agentId.trim())}?${aQs}`,
          { signal },
        );
        if (aRes.ok) {
          const agentSummary = (await aRes.json()) as {
            metrics: AgentFinanceMetrics;
          };
          agentMetrics = agentSummary.metrics;
        }
      }

      return {
        dashboard,
        reconciliation,
        corrections,
        countrySummary,
        agentMetrics,
      };
    },
    [apiFetch, countryId, currency, agentId, includePilotRecords, finLocale],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 250,
  });

  const source = resolveAdminDataSourceLabel({
    containsPilotRecords: data?.dashboard.meta.containsPilotRecords,
    syntheticSource: data?.dashboard.meta.synthetic === true,
    productionFirestore: data?.dashboard.meta.synthetic === false,
    documentIds: data?.corrections.map((c) => c.id) ?? [],
  });

  const tableAlign = locale === "ar" ? "text-start" : "text-start";

  return (
    <AdminShell title={t("finance")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb items={[{ label: t("finance") }]} />
        <div
          data-testid="fr7-source-badge"
          className="mb-4 inline-flex rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900"
        >
          {accountant
            ? presentFinanceTerm("certifiedTotals", finLocale)
            : t("fr7Authoritative")}
        </div>
        {source.code === "development_synthetic" || source.code === "unavailable" ? (
          <SourceLabelBadge testId="synthetic-badge" source={source} />
        ) : null}
        {!accountant &&
        data?.dashboard.meta.includePilotRecords === true &&
        data.dashboard.meta.containsPilotRecords ? (
          <p
            data-testid="finance-pilot-notice"
            className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
          >
            {presentFinanceTerm("pilotNotice", finLocale)}
          </p>
        ) : null}

        <div
          data-testid="finance-filters"
          className="mb-4 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <label className="text-sm">
            {presentFinanceTerm("country", finLocale)}
            <div className="mt-1">
              <FinanceCountryFilterSelect
                value={countryId}
                onChange={setCountryId}
                locale={locale}
                allLabel={t("allCountries")}
                testId="finance-country-filter"
                className="block rounded border px-2 py-1"
              />
            </div>
          </label>
          <label className="text-sm">
            {presentFinanceTerm("currency", finLocale)}
            <select
              data-testid="finance-currency-filter"
              className="mt-1 block rounded border px-2 py-1"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="">{presentFinanceTerm("all", finLocale)}</option>
              <option value="SAR">SAR</option>
              <option value="AED">AED</option>
              <option value="EGP">EGP</option>
              <option value="KWD">KWD</option>
              <option value="JOD">JOD</option>
            </select>
          </label>
          <label className="text-sm">
            {presentFinanceTerm("agentId", finLocale)}
            <input
              data-testid="finance-agent-filter"
              className="mt-1 block rounded border px-2 py-1"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder={countryId ? undefined : "—"}
              disabled={!countryId}
            />
          </label>
        </div>

        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock rows={6} />
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

        {data?.dashboard ? (
          <div
            data-testid="finance-fr7-dashboard"
            dir={locale === "ar" ? "rtl" : "ltr"}
            className="space-y-6"
          >
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span>
                {presentFinanceTerm("scope", finLocale)}:{" "}
                <strong>{presentFinanceTerm(data.dashboard.meta.scope, finLocale)}</strong>
              </span>
              <span>
                {presentFinanceTerm("completeness", finLocale)}:{" "}
                <StatusBadge value={data.dashboard.meta.sourceCompleteness} />
              </span>
              {data.dashboard.meta.incompleteReasons.includes("bounded_financial_window") ? (
                <p
                  data-testid="finance-bounded-window"
                  className="w-full rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950"
                >
                  {presentFinanceTerm("boundedWindow", finLocale)}
                </p>
              ) : null}
              {data.dashboard.meta.incompleteReasons.includes(
                "no_certified_accounting_snapshots",
              ) ? (
                <div
                  data-testid="finance-no-snapshots"
                  className="w-full rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-800"
                >
                  <p className="text-sm">
                    {presentFinanceTerm("noCertifiedSnapshots", finLocale)}
                  </p>
                  {!accountant ? (
                    <p
                      className="mt-2 text-xs text-slate-600"
                      data-testid="finance-snapshot-write-gate-hint"
                    >
                      {presentFinanceTerm("snapshotWriteGateHint", finLocale)}
                    </p>
                  ) : null}
                  <Link
                    href="/settlements"
                    className="mt-2 inline-block text-sm font-medium text-emerald-800 underline"
                    data-testid="finance-open-settlements"
                  >
                    {presentFinanceTerm("openSettlements", finLocale)}
                  </Link>
                  <Link
                    href="/finance/driver-wallets"
                    className="mt-2 ms-4 inline-block text-sm font-medium text-emerald-800 underline"
                    data-testid="finance-open-driver-wallets"
                  >
                    {t("driverWallets")}
                  </Link>
                </div>
              ) : null}
              {data.dashboard.meta.sourceCompleteness === "incomplete" ? (
                <div className="w-full basis-full">
                  <IncompleteState
                    message={presentFinanceTerm("financialIncomplete", finLocale)}
                  />
                </div>
              ) : data.dashboard.meta.sourceCompleteness === "partial" &&
                !data.dashboard.meta.incompleteReasons.includes(
                  "bounded_financial_window",
                ) &&
                !data.dashboard.meta.incompleteReasons.includes(
                  "no_certified_accounting_snapshots",
                ) ? (
                <p className="w-full text-sm text-slate-600">
                  {presentFinanceTerm("financialIncomplete", finLocale)}
                </p>
              ) : null}
              {data.reconciliation ? (
                <span data-testid="finance-recon-status">
                  {presentFinanceTerm("recon", finLocale)}:{" "}
                  <StatusBadge value={data.reconciliation.status} />
                </span>
              ) : null}
              <span>
                {presentFinanceTerm("settlementsSection", finLocale)}:{" "}
                {data.dashboard.settlementCount}
              </span>
            </div>

            <div
              data-testid="finance-forward-isolation"
              className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div>
                <p className="text-xs text-slate-500">
                  {presentFinanceTerm("certifiedTotals", finLocale)}
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {data.dashboard.certifiedSnapshotCount ??
                    data.dashboard.incompleteTripCount ??
                    "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {presentFinanceTerm("historicalIncompleteCount", finLocale)}
                </p>
                <p
                  className="text-lg font-semibold text-amber-900"
                  data-testid="finance-historical-incomplete-count"
                >
                  {data.dashboard.historicalIncompleteCount ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {presentFinanceTerm("financialConflictsCount", finLocale)}
                </p>
                <p
                  className="text-lg font-semibold text-rose-900"
                  data-testid="finance-conflict-count"
                >
                  {data.dashboard.financialConflictCount ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {presentFinanceTerm("openSettlementsCount", finLocale)}
                </p>
                <p
                  className="text-lg font-semibold text-slate-800"
                  data-testid="finance-open-settlements-count"
                >
                  {data.dashboard.unsettledCertifiedCommercialSnapshotCount ??
                    data.dashboard.settlementCount ??
                    "—"}
                </p>
              </div>
            </div>

            {isSuperAdmin ? (
            <div
              data-testid="finance-commercial-cutover-dq"
              className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <div>
                <p className="text-xs text-slate-500">
                  {presentFinanceTerm(
                    "legacySettlementsNeedingReview",
                    finLocale,
                  )}
                </p>
                <p
                  className="text-lg font-semibold text-amber-900"
                  data-testid="finance-legacy-review-count"
                >
                  {data.dashboard.legacySettlementsNeedingReviewCount ??
                    data.dashboard.orphanLegacySettlementCount ??
                    "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {presentFinanceTerm(
                    "certifiedCommercialSnapshotCount",
                    finLocale,
                  )}
                </p>
                <p
                  className="text-lg font-semibold text-slate-900"
                  data-testid="finance-certified-commercial-snap-count"
                >
                  {data.dashboard.certifiedCommercialSnapshotCount ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {presentFinanceTerm(
                    "unsettledCertifiedCommercialSnapshotCount",
                    finLocale,
                  )}
                </p>
                <p
                  className="text-lg font-semibold text-slate-800"
                  data-testid="finance-unsettled-certified-snap-count"
                >
                  {data.dashboard.unsettledCertifiedCommercialSnapshotCount ??
                    "—"}
                </p>
              </div>
            </div>
            ) : null}

            {accountant ? (
              <section data-testid="finance-group-accountant-kpis">
                <h2 className="mb-3 text-lg font-semibold text-slate-900">
                  {presentFinanceTerm("companyRevenue", finLocale)}
                </h2>
                {data.dashboard.meta.incompleteReasons.includes(
                  "no_certified_accounting_snapshots",
                ) &&
                ACCOUNTANT_MONEY_KEYS.every((key) => {
                  const m = data.dashboard.company[key];
                  return (
                    m.availability === "not_represented" ||
                    m.availability === "missing" ||
                    m.amountMinor == null
                  );
                }) ? (
                  <p
                    data-testid="finance-accountant-empty-certified"
                    className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-700"
                  >
                    {presentFinanceTerm("noCertifiedSnapshots", finLocale)}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {ACCOUNTANT_MONEY_KEYS.map((key) => (
                      <MetricCard
                        key={key}
                        testId={`finance-metric-${key}`}
                        label={<FinanceTermLabel termKey={key} />}
                        value={
                          <MoneyCell money={data.dashboard.company[key]} />
                        }
                      />
                    ))}
                    <MetricCard
                      testId="finance-metric-driverNet"
                      label={<FinanceTermLabel termKey="driverNet" />}
                      value={
                        <MoneyCell
                          money={unavailableReportMoney(
                            data.dashboard.meta.currency,
                          )}
                        />
                      }
                    />
                    <MetricCard
                      testId="finance-metric-recon"
                      label={presentFinanceTerm("recon", finLocale)}
                      value={
                        data.reconciliation ? (
                          <StatusBadge value={data.reconciliation.status} />
                        ) : (
                          "—"
                        )
                      }
                    />
                  </div>
                )}
              </section>
            ) : (
            DASHBOARD_GROUPS.map((group) => {
              const snapshotBacked =
                group.id === "business-volume" || group.id === "company-revenue";
              const hideSnapshotGrid =
                snapshotBacked &&
                data.dashboard.meta.incompleteReasons.includes(
                  "no_certified_accounting_snapshots",
                ) &&
                group.keys.every((key) => {
                  const m = data.dashboard.company[key];
                  return (
                    m.availability === "not_represented" ||
                    m.availability === "missing" ||
                    m.amountMinor == null
                  );
                });
              return (
              <section
                key={group.id}
                data-testid={`finance-group-${group.id}`}
              >
                <h2 className="mb-3 text-lg font-semibold text-slate-900">
                  {presentFinanceTerm(group.titleKey, finLocale)}
                </h2>
                {group.id === "driver-position" ? (
                  <p className="mb-2 text-sm text-slate-600">
                    {presentFinanceTerm(
                      "driverPositionUnavailable",
                      finLocale,
                    )}
                  </p>
                ) : null}
                {hideSnapshotGrid ? (
                  <p
                    data-testid={`finance-group-${group.id}-collapsed`}
                    className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-600"
                  >
                    {presentFinanceTerm("snapshotBackedMetricsHidden", finLocale)}
                  </p>
                ) : (
                <div
                  data-testid={
                    group.id === "business-volume"
                      ? "finance-company-metrics"
                      : undefined
                  }
                  className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                >
                  {group.keys.map((key) => (
                    <MetricCard
                      key={key}
                      testId={`finance-metric-${key}`}
                      label={<FinanceTermLabel termKey={key} />}
                      value={
                        <MoneyCell money={data.dashboard.company[key]} />
                      }
                    />
                  ))}
                  {(group.unavailableExtras ?? []).map((key) => (
                    <MetricCard
                      key={key}
                      testId={`finance-metric-${key}`}
                      label={<FinanceTermLabel termKey={key} />}
                      value={
                        <MoneyCell
                          money={unavailableReportMoney(
                            data.dashboard.meta.currency,
                          )}
                        />
                      }
                    />
                  ))}
                </div>
                )}
              </section>
              );
            })
            )}

            <section data-testid="finance-currency-groups">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">
                {presentFinanceTerm("byCurrency", finLocale)}
              </h2>
              {data.dashboard.byCurrency.length === 0 ? (
                <EmptyState
                  message={presentFinanceTerm("noMatchingRecords", finLocale)}
                />
              ) : (
                <div className="space-y-4">
                  {data.dashboard.byCurrency.map((group) => (
                    <div
                      key={group.currency}
                      data-testid={`finance-currency-${group.currency}`}
                      className="rounded-lg border border-slate-200 bg-white p-4"
                    >
                      <p className="mb-3 font-semibold text-slate-800">
                        {group.currency}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div>
                          <FinanceTermLabel termKey="grossBookingValue" />:{" "}
                          <MoneyCell money={group.company.grossBookingValue} />
                        </div>
                        <div>
                          <FinanceTermLabel termKey="platformCommission" />:{" "}
                          <MoneyCell
                            money={group.company.platformCommission}
                          />
                        </div>
                        <div>
                          <FinanceTermLabel termKey="settled" />:{" "}
                          <MoneyCell money={group.company.settled} />
                        </div>
                      </div>
                      {group.company.grossBookingValue.availability ===
                        "not_represented" &&
                      group.company.settled.availability === "available" ? (
                        <p className="mt-2 text-xs text-slate-500">
                          {presentFinanceTerm("noCertifiedSnapshots", finLocale)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {data.countrySummary ? (
              <section data-testid="finance-country-view">
                <h2 className="mb-3 text-lg font-semibold text-slate-900">
                  {presentFinanceTerm("countryFinance", finLocale)} —{" "}
                  {data.countrySummary.countryId}
                </h2>
                <div className="mb-2 flex flex-wrap gap-3 text-sm">
                  <span>
                    {presentFinanceTerm("activeAgent", finLocale)}:{" "}
                    {data.countrySummary.activeAgentIdToken ?? "—"}
                  </span>
                  <span>
                    {presentFinanceTerm("invariant", finLocale)}:{" "}
                    <StatusBadge
                      value={data.countrySummary.activeAgentInvariant}
                    />
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {(
                    [
                      "grossBookingValue",
                      "platformCommission",
                      "settled",
                      "outstanding",
                    ] as Array<keyof CompanyFinanceMetrics>
                  ).map((key) => (
                    <MetricCard
                      key={key}
                      testId={`finance-country-metric-${key}`}
                      label={<FinanceTermLabel termKey={key} />}
                      value={
                        <MoneyCell money={data.countrySummary!.company[key]} />
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {data.agentMetrics ? (
              <section data-testid="finance-agent-view">
                <h2 className="mb-3 text-lg font-semibold text-slate-900">
                  {presentFinanceTerm("agentFinance", finLocale)}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {AGENT_KEYS.map((key) => {
                    const money = data.agentMetrics![key] as ReportMoney;
                    return (
                      <MetricCard
                        key={key}
                        testId={`finance-agent-metric-${key}`}
                        label={<FinanceTermLabel termKey={key} />}
                        value={<MoneyCell money={money} />}
                      />
                    );
                  })}
                </div>
              </section>
            ) : null}

            {!accountant ? (
            <section data-testid="finance-corrections">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">
                {presentFinanceTerm("correctionsSection", finLocale)}
              </h2>
              {data.corrections.length === 0 ? (
                <EmptyState
                  message={presentFinanceTerm("noMatchingRecords", finLocale)}
                />
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className={`px-3 py-2 ${tableAlign}`}>
                          {presentFinanceTerm("kind", finLocale)}
                        </th>
                        <th className={`px-3 py-2 ${tableAlign}`}>
                          {presentFinanceTerm("status", finLocale)}
                        </th>
                        <th className={`px-3 py-2 ${tableAlign}`}>
                          {presentFinanceTerm("amount", finLocale)}
                        </th>
                        <th className={`px-3 py-2 ${tableAlign}`}>
                          {presentFinanceTerm("monetaryEffect", finLocale)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.corrections.map((c) => {
                        const kindLabel = presentCorrectionKind(
                          c.kind,
                          finLocale,
                          {
                            directionOrKind: c.directionOrKind,
                            monetaryEffect: c.monetaryEffect,
                          },
                        );
                        return (
                          <tr
                            key={`${c.kind}-${c.id}`}
                            className="border-t"
                            data-testid={`finance-correction-${c.id}`}
                            data-monetary={
                              c.monetaryEffect ? "yes" : "no"
                            }
                          >
                            <td className="px-3 py-2">{kindLabel}</td>
                            <td className="px-3 py-2">
                              <StatusBadge value={c.status} />
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {!c.monetaryEffect ? (
                                <span className="text-slate-600">
                                  {presentFinanceTerm("neutralMemo", finLocale)}
                                </span>
                              ) : c.amountMinor == null ? (
                                presentMoneyAvailability("missing", finLocale)
                              ) : (
                                formatMinorUnitsDisplay(
                                  c.amountMinor,
                                  c.currency,
                                )
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {c.monetaryEffect
                                ? presentFinanceTerm("monetaryYes", finLocale)
                                : presentFinanceTerm("monetaryNo", finLocale)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            ) : null}
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
