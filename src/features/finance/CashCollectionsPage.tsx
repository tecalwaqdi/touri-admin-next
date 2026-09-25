"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ForbiddenState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FinanceCountryFilterSelect } from "@/components/ui/FinanceCountryFilterSelect";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { formatMinorUnitsDisplay } from "@/features/finance/formatReportMoney";
import {
  presentFinanceTerm,
  presentMoneyAvailability,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { presentSettlementPartyType } from "@/features/settlements/settlementPartyPresentation";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import { FormattedDateTime } from "@/components/i18n/FormattedDateTime";
import type { CashCollectionRow } from "@/domain/finance/reporting/AccountantCashCollections";
import { FinancePartyNameFilter } from "@/components/ui/FinancePartyNameFilter";

type ListResponse = { items: CashCollectionRow[] };

function moneyLabel(
  amountMinor: string | null,
  currency: string,
  locale: FinanceLocale,
): string {
  if (amountMinor == null) {
    return presentMoneyAvailability("missing", locale);
  }
  return formatMinorUnitsDisplay(amountMinor, currency);
}

function detailsHref(row: CashCollectionRow): string | null {
  if (!row.partyId) return null;
  if (row.partyType === "agent") {
    return `/finance/agents/${encodeURIComponent(row.partyId)}?countryId=${encodeURIComponent(row.countryId)}`;
  }
  if (row.partyType === "driver") {
    const qs = new URLSearchParams();
    qs.set("driverId", row.partyId);
    if (row.countryId) qs.set("countryId", row.countryId);
    return `/settlements?${qs}`;
  }
  return null;
}

export function CashCollectionsPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [countryId, setCountryId] = useState("");
  const [currency, setCurrency] = useState("");
  const [driverId, setDriverId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () =>
      `cash-collections:${countryId}:${currency}:${driverId}:${agentId}:${periodFrom}:${periodTo}`,
    [countryId, currency, driverId, agentId, periodFrom, periodTo],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currency.trim()) qs.set("currency", currency.trim());
      if (driverId.trim()) qs.set("driverId", driverId.trim());
      if (agentId.trim()) qs.set("agentId", agentId.trim());
      if (periodFrom) qs.set("from", `${periodFrom}T00:00:00.000Z`);
      if (periodTo) qs.set("to", `${periodTo}T23:59:59.999Z`);
      const res = await apiFetch(`/api/finance/cash-collections?${qs}`, {
        signal,
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!res.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      return (await res.json()) as ListResponse;
    },
    [
      apiFetch,
      countryId,
      currency,
      driverId,
      agentId,
      periodFrom,
      periodTo,
      finLocale,
    ],
  );

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    isEmpty: (payload) => payload.items.length === 0,
  });

  return (
    <AdminShell title={t("cashCollections")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/finance", label: t("finance") },
            { label: t("cashCollections") },
          ]}
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className={adminUi.sectionTitle}>{t("cashCollections")}</h1>
          <Link href="/finance" className={adminUi.link}>
            {t("finance")}
          </Link>
        </div>

        <FilterBar>
          <FilterField label={presentFinanceTerm("country", finLocale)}>
            <FinanceCountryFilterSelect
              value={countryId}
              onChange={setCountryId}
              locale={locale}
              allLabel={t("allCountries")}
              testId="cash-country-filter"
              className={adminUi.filterControl}
            />
          </FilterField>
          <FilterField label={presentFinanceTerm("currency", finLocale)}>
            <input
              className={adminUi.filterControl}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder={presentFinanceTerm("currency", finLocale)}
              data-testid="cash-currency-filter"
            />
          </FilterField>
          <FinancePartyNameFilter
            partyType="driver"
            value={driverId}
            onChange={setDriverId}
            countryId={countryId || undefined}
            testId="cash-driver-filter"
          />
          <FinancePartyNameFilter
            partyType="agent"
            value={agentId}
            onChange={setAgentId}
            countryId={countryId || undefined}
            testId="cash-agent-filter"
            disabled={!countryId}
          />
          <FilterField label={presentFinanceTerm("periodFrom", finLocale)}>
            <input
              type="date"
              className={adminUi.filterControl}
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              data-testid="cash-from-filter"
            />
          </FilterField>
          <FilterField label={presentFinanceTerm("periodTo", finLocale)}>
            <input
              type="date"
              className={adminUi.filterControl}
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              data-testid="cash-to-filter"
            />
          </FilterField>
          <button
            type="button"
            className={adminUi.btnSecondary}
            onClick={() => reload()}
            data-testid="cash-reload"
          >
            {t("retry")}
          </button>
        </FilterBar>

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
        {state === "empty" ? (
          <EmptyState
            message={presentFinanceTerm("emptyCashCollectionsPeriod", finLocale)}
          />
        ) : null}

        {state === "success" && data && data.items.length > 0 ? (
          <AdminDataTable testId="cash-collections-table">
            <AdminTableHead>
              <tr>
                <AdminTh>{presentFinanceTerm("party", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("country", finLocale)}</AdminTh>
                <AdminTh>
                  {presentFinanceTerm("expectedCash", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("collectedCashCol", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("outstanding", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("lastCollection", finLocale)}
                </AdminTh>
                <AdminTh>{presentFinanceTerm("status", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("details", finLocale)}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {data.items.map((row) => {
                const href = detailsHref(row);
                const key = `${row.partyType}:${row.partyId ?? "x"}:${row.countryId}:${row.currency}`;
                return (
                  <AdminTr key={key}>
                    <AdminTd>
                      {presentSettlementPartyType(row.partyType, finLocale)}
                      {row.partyId ? (
                        <span className="ms-1 text-xs text-slate-500" dir="ltr">
                          ({row.partyId})
                        </span>
                      ) : null}
                    </AdminTd>
                    <AdminTd>
                      <span dir="ltr">{row.countryId}</span>
                    </AdminTd>
                    <AdminTd className="tabular-nums">
                      {moneyLabel(row.expectedMinor, row.currency, finLocale)}
                    </AdminTd>
                    <AdminTd className="tabular-nums">
                      {moneyLabel(row.collectedMinor, row.currency, finLocale)}
                    </AdminTd>
                    <AdminTd className="tabular-nums">
                      {moneyLabel(
                        row.outstandingMinor,
                        row.currency,
                        finLocale,
                      )}
                    </AdminTd>
                    <AdminTd>
                      {row.lastCollectionUtc ? (
                        <FormattedDateTime value={row.lastCollectionUtc} />
                      ) : (
                        "—"
                      )}
                    </AdminTd>
                    <AdminTd>
                      <StatusBadge value={row.status} />
                    </AdminTd>
                    <AdminTd>
                      {href ? (
                        <Link className={adminUi.link} href={href}>
                          {presentFinanceTerm("details", finLocale)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </AdminTd>
                  </AdminTr>
                );
              })}
            </tbody>
          </AdminDataTable>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
