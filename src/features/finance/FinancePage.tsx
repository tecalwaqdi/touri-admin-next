"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  ForbiddenState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { FinanceCountryFilterSelect } from "@/components/ui/FinanceCountryFilterSelect";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/auth/AuthContext";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { isAccountantRole } from "@/domain/ui/accountantWorkspace";
import type {
  FinanceDashboardSummary,
  ReconciliationIndicatorReadModel,
  SettlementListItem,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { FinancePartyNameFilter } from "@/components/ui/FinancePartyNameFilter";
import { AccountantFinanceHome } from "@/features/finance/AccountantFinanceHome";
import { AccountantPageHeader } from "@/components/ui/accountant/AccountantPageHeader";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { FinanceLocaleDateInput } from "@/components/ui/FinanceLocaleDateInput";
import { adminUi } from "@/components/ui/adminUi";
import {
  resolveAccountantDatePreset,
  type AccountantDatePreset,
} from "@/domain/ui/accountantDatePresets";
import type { AccountantDataClass } from "@/domain/finance/reporting/AccountantDataClassification";
import { resolveFinancePeriodSplit } from "@/domain/finance/cutover/FinancePeriodSplit";
import Link from "next/link";

const PERIOD_PRESETS: Array<{
  id: AccountantDatePreset;
  labelKey: string;
}> = [
  { id: "today", labelKey: "reportToday" },
  { id: "last7", labelKey: "reportLast7Days" },
  { id: "this_month", labelKey: "reportThisMonth" },
  { id: "prev_month", labelKey: "reportPreviousMonth" },
  { id: "custom", labelKey: "reportCustomPeriod" },
];

const DATA_CLASS_OPTIONS: Array<{ value: "" | AccountantDataClass; labelKey: string }> =
  [
    { value: "", labelKey: "allDataClasses" },
    { value: "certified", labelKey: "classCertified" },
    { value: "operational", labelKey: "classOperational" },
    { value: "historical", labelKey: "classHistorical" },
    { value: "incomplete", labelKey: "classIncomplete" },
    { value: "conflict", labelKey: "classConflict" },
    { value: "qa_test", labelKey: "classQaTest" },
    { value: "uncertified", labelKey: "classUncertified" },
  ];

export function FinancePage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const accountant = isAccountantRole(session.user?.role);
  const [countryId, setCountryId] = useState("");
  const accountantCountryDefaulted = useRef(false);
  useEffect(() => {
    if (!accountant || accountantCountryDefaulted.current) return;
    accountantCountryDefaulted.current = true;
    setCountryId((prev) => prev || "SA");
  }, [accountant]);

  const [currency, setCurrency] = useState("");
  const [agentId, setAgentId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [dataClass, setDataClass] = useState<"" | AccountantDataClass>("");
  const [datePreset, setDatePreset] = useState<AccountantDatePreset>("this_month");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const periodSplit = useMemo(
    () =>
      resolveFinancePeriodSplit({
        cutoverDate: "2026-10-01",
        timezone: "Asia/Riyadh",
      }),
    [],
  );

  useEffect(() => {
    if (datePreset === "custom") return;
    const bounds = resolveAccountantDatePreset(datePreset);
    if (bounds) {
      // Current-period isolation: never start before cutover for default presets.
      const cutDay = periodSplit.cutover.businessDate;
      setPeriodFrom(bounds.from < cutDay ? cutDay : bounds.from);
      setPeriodTo(bounds.to);
    }
  }, [datePreset, periodSplit.cutover.businessDate]);

  const apiFromUtc = useMemo(() => {
    if (!periodFrom) return periodSplit.currentPeriodFromUtc;
    // Prefer cutover UTC instant when from date equals cutover business day
    if (periodFrom === periodSplit.cutover.businessDate) {
      return periodSplit.currentPeriodFromUtc;
    }
    return `${periodFrom}T00:00:00.000Z`;
  }, [periodFrom, periodSplit]);

  const filterQs = useMemo(() => {
    const qs = new URLSearchParams();
    if (countryId) qs.set("countryId", countryId);
    if (currency) qs.set("currency", currency);
    if (agentId.trim()) qs.set("agentId", agentId.trim());
    if (driverId.trim()) qs.set("driverId", driverId.trim());
    qs.set("from", apiFromUtc);
    if (periodTo) qs.set("to", `${periodTo}T23:59:59.999Z`);
    return qs.toString();
  }, [countryId, currency, agentId, driverId, apiFromUtc, periodTo]);

  const queryKey = useMemo(
    () =>
      `fr7-dash:${countryId}:${currency}:${agentId}:${driverId}:${apiFromUtc}:${periodTo}`,
    [countryId, currency, agentId, driverId, apiFromUtc, periodTo],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currency) qs.set("currency", currency);
      if (agentId.trim()) qs.set("agentId", agentId.trim());
      if (driverId.trim()) qs.set("driverId", driverId.trim());
      if (periodFrom) qs.set("from", apiFromUtc);
      else qs.set("from", periodSplit.currentPeriodFromUtc);
      if (periodTo) qs.set("to", `${periodTo}T23:59:59.999Z`);
      const [dashRes, reconRes, settRes] = await Promise.all([
        apiFetch(`/api/finance/dashboard?${qs}`, { signal }),
        apiFetch(`/api/finance/reconciliation?${qs}`, { signal }),
        apiFetch(`/api/finance/settlements?${qs}`, { signal }),
      ]);
      if (dashRes.status === 403 || reconRes.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!dashRes.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      const dashboard = (await dashRes.json()) as FinanceDashboardSummary & {
        driverNet?: import("@/domain/finance/reporting/FinanceReportingTypes").ReportMoney;
      };
      const reconciliation = reconRes.ok
        ? ((await reconRes.json()) as ReconciliationIndicatorReadModel)
        : null;
      const settlements = settRes.ok
        ? (((await settRes.json()) as { items: SettlementListItem[] }).items ??
          [])
        : [];
      return { dashboard, reconciliation, settlements };
    },
    [apiFetch, countryId, currency, agentId, driverId, periodFrom, periodTo, apiFromUtc, periodSplit.currentPeriodFromUtc, finLocale],
  );

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
  });

  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (state === "success" && data?.dashboard) {
      setLastUpdatedAt(new Date());
    }
  }, [state, data, queryKey]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return null;
    const time = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(lastUpdatedAt);
    return presentFinanceTerm("lastUpdatedAt", finLocale).replace(
      "{time}",
      time,
    );
  }, [lastUpdatedAt, locale, finLocale]);

  return (
    <AdminShell title={t("finance")} hideTitle>
      <PermissionGuard permission="finance:read">
        <AccountantPageHeader
          title={presentFinanceTerm("financeHome", finLocale)}
          subtitle={presentFinanceTerm("financeHomeSubtitle", finLocale)}
          breadcrumbs={[{ label: presentFinanceTerm("financeHome", finLocale) }]}
        />
        {lastUpdatedLabel ? (
          <p
            className="-mt-2 mb-3 text-xs text-slate-500"
            data-testid="finance-last-updated"
          >
            {lastUpdatedLabel}
          </p>
        ) : null}
        <div
          className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3"
          data-testid="finance-period-split"
        >
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] text-slate-500">
              {presentFinanceTerm("openingBalance", finLocale)}
            </p>
            <p className="text-sm font-medium text-slate-800">—</p>
            <p className="text-[10px] text-slate-400">
              {periodSplit.cutover.businessDate}{" "}
              {periodSplit.cutover.cutoverTimezone}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] text-slate-500">
              {presentFinanceTerm("periodActivity", finLocale)}
            </p>
            <p className="text-sm font-medium text-slate-800">
              {presentFinanceTerm("financeHomeSubtitle", finLocale)}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] text-slate-500">
              {presentFinanceTerm("currentBalance", finLocale)}
            </p>
            <p className="text-sm font-medium text-slate-800">
              {presentFinanceTerm("periodActivity", finLocale)} +{" "}
              {presentFinanceTerm("openingBalance", finLocale)}
            </p>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-slate-500">
          <Link href="/finance/archive" className="underline">
            {presentFinanceTerm("financeArchive", finLocale)}
          </Link>
        </p>

        <div
          data-testid="finance-period-presets"
          className="mb-3 flex flex-wrap gap-1.5"
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              data-testid={`finance-date-preset-${p.id}`}
              className={
                datePreset === p.id
                  ? "rounded border border-emerald-600 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900"
                  : "rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-slate-300"
              }
              onClick={() => setDatePreset(p.id)}
            >
              {presentFinanceTerm(p.labelKey, finLocale)}
            </button>
          ))}
        </div>

        <div data-testid="finance-filters" className="mb-4">
          <FilterBar>
            <FilterField label={presentFinanceTerm("country", finLocale)}>
              <FinanceCountryFilterSelect
                value={countryId}
                onChange={setCountryId}
                locale={locale}
                allLabel={t("allCountries")}
                testId="finance-country-filter"
                className={adminUi.filterControl}
              />
            </FilterField>
            <FinancePartyNameFilter
              partyType="agent"
              value={agentId}
              onChange={setAgentId}
              countryId={countryId || undefined}
              testId="finance-agent-filter"
              disabled={!countryId}
            />
            <FinancePartyNameFilter
              partyType="driver"
              value={driverId}
              onChange={setDriverId}
              countryId={countryId || undefined}
              testId="finance-driver-filter"
            />
            <FilterField label={presentFinanceTerm("currency", finLocale)}>
              <select
                data-testid="finance-currency-filter"
                className={adminUi.filterControl}
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
            </FilterField>
            <FilterField label={presentFinanceTerm("dataClassification", finLocale)}>
              <select
                data-testid="finance-dataclass-filter"
                className={adminUi.filterControl}
                value={dataClass}
                title={presentFinanceTerm(
                  "dataClassificationFilterHelp",
                  finLocale,
                )}
                aria-describedby="finance-dataclass-help"
                onChange={(e) =>
                  setDataClass(e.target.value as "" | AccountantDataClass)
                }
              >
                {DATA_CLASS_OPTIONS.map((opt) => (
                  <option key={opt.value || "all"} value={opt.value}>
                    {presentFinanceTerm(opt.labelKey, finLocale)}
                  </option>
                ))}
              </select>
            </FilterField>
            {datePreset === "custom" ? (
              <>
                <FilterField label={presentFinanceTerm("periodFrom", finLocale)}>
                  <FinanceLocaleDateInput
                    testId="finance-period-from"
                    locale={locale}
                    className={adminUi.filterControl}
                    value={periodFrom}
                    onChange={(next) => {
                      setDatePreset("custom");
                      setPeriodFrom(next);
                    }}
                  />
                </FilterField>
                <FilterField label={presentFinanceTerm("periodTo", finLocale)}>
                  <FinanceLocaleDateInput
                    testId="finance-period-to"
                    locale={locale}
                    className={adminUi.filterControl}
                    value={periodTo}
                    onChange={(next) => {
                      setDatePreset("custom");
                      setPeriodTo(next);
                    }}
                  />
                </FilterField>
              </>
            ) : null}
          </FilterBar>
          <p
            id="finance-dataclass-help"
            className="mt-1 max-w-3xl text-[11px] leading-snug text-slate-500"
            data-testid="finance-dataclass-help"
          >
            {presentFinanceTerm("dataClassificationFilterHelp", finLocale)}
          </p>
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
          <>
            <UnavailableState message={error} />
            <button
              type="button"
              className="mt-3 rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
              onClick={reload}
            >
              {t("retry")}
            </button>
          </>
        ) : null}

        {data?.dashboard ? (
          <div
            data-testid="finance-fr7-dashboard"
            dir={locale === "ar" ? "rtl" : "ltr"}
            className="mx-auto max-w-[1400px] space-y-4"
          >
            <AccountantFinanceHome
              locale={finLocale}
              filterQs={filterQs}
              dashboard={data.dashboard}
              settlements={data.settlements ?? []}
              reconciliation={data.reconciliation}
              driverId={driverId}
              dataClass={dataClass}
            />
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
