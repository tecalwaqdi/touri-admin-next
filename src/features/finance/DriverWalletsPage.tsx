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
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { formatMinorUnitsDisplay } from "@/features/finance/formatReportMoney";
import {
  presentFinanceTerm,
  presentMoneyAvailability,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import { FinancePartyNameFilter } from "@/components/ui/FinancePartyNameFilter";
import { FinanceCountryFilterSelect } from "@/components/ui/FinanceCountryFilterSelect";
import type { DriverWalletListItem } from "@/domain/finance/wallet/DriverWalletReadModels";
import type {
  DriverFinanceSummary,
  ReportMoney,
} from "@/domain/finance/reporting/FinanceReportingTypes";

type WalletRow = DriverWalletListItem & {
  driverLabel?: string | null;
};

type ListResponse = {
  items: WalletRow[];
  warnings?: string[];
  mode?: string;
  driverFinance?: DriverFinanceSummary | null;
};

function balanceLabel(item: WalletRow, locale: FinanceLocale): string {
  if (
    item.balance.amountMinor == null ||
    item.balance.availability !== "available"
  ) {
    return presentMoneyAvailability(item.balance.availability, locale);
  }
  return formatMinorUnitsDisplay(item.balance.amountMinor, item.currency);
}

function moneyLabel(m: ReportMoney | undefined, locale: FinanceLocale): string {
  if (!m || m.amountMinor == null || m.availability !== "available") {
    return presentMoneyAvailability(m?.availability ?? "unknown", locale);
  }
  return formatMinorUnitsDisplay(m.amountMinor, m.currency);
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export function DriverWalletsPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [driverId, setDriverId] = useState("");
  const [countryId, setCountryId] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () => `driver-wallets:${driverId}:${countryId}`,
    [driverId, countryId],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (driverId.trim()) qs.set("driverId", driverId.trim());
      if (countryId) qs.set("countryId", countryId);
      const res = await apiFetch(`/api/finance/driver-wallets?${qs}`, {
        signal,
      });
      if (res.status === 403) {
        setForbidden(true);
        throw new Error("forbidden");
      }
      if (!res.ok) throw new Error(`wallet_list_failed:${res.status}`);
      const body = (await res.json()) as ListResponse;
      let driverFinance: DriverFinanceSummary | null = null;
      if (driverId.trim()) {
        const finRes = await apiFetch(
          `/api/finance/drivers/${encodeURIComponent(driverId.trim())}`,
          { signal },
        );
        if (finRes.ok) {
          driverFinance = (await finRes.json()) as DriverFinanceSummary;
        }
      }
      return { ...body, driverFinance };
    },
    [apiFetch, countryId, driverId],
  );

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    isEmpty: (payload) => payload.items.length === 0,
  });

  return (
    <AdminShell title={t("driverWallets")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/finance", label: t("finance") },
            { label: t("driverWallets") },
          ]}
        />
        <h1 className={`${adminUi.sectionTitle} mb-4`}>{t("driverWallets")}</h1>

        <FilterBar>
          <FilterField label={presentFinanceTerm("country", finLocale)}>
            <FinanceCountryFilterSelect
              value={countryId}
              onChange={setCountryId}
              locale={locale}
              allLabel={t("allCountries")}
              testId="wallets-country-filter"
              className={adminUi.filterControl}
            />
          </FilterField>
          <FinancePartyNameFilter
            partyType="driver"
            value={driverId}
            onChange={setDriverId}
            countryId={countryId || undefined}
            testId="wallets-driver-filter"
          />
          <button
            type="button"
            className={adminUi.btnSecondary}
            onClick={() => reload()}
            data-testid="wallets-reload"
          >
            {t("retry")}
          </button>
        </FilterBar>

        {forbidden ? <ForbiddenState /> : null}
        {state === "loading" ? <SkeletonBlock rows={6} /> : null}
        {state === "error" && !forbidden ? (
          <UnavailableState message={error} />
        ) : null}
        {state === "empty" ? (
          <EmptyState
            message={presentFinanceTerm("emptyCertifiedTripsPeriod", finLocale)}
          />
        ) : null}

        {state === "success" && data?.driverFinance ? (
          <section
            data-testid="driver-list-finance-enrichment"
            className="mb-4 rounded-lg border bg-white p-4"
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <h2 className="mb-2 text-base font-semibold text-slate-900">
              {presentFinanceTerm("driverFinance", finLocale)}
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  "grossEarnings",
                  "commission",
                  "vat",
                  "driverNet",
                  "outstandingAmount",
                  "settledAmount",
                ] as const
              ).map((key) => (
                <div key={key}>
                  <dt className="text-xs text-slate-500">
                    {presentFinanceTerm(key, finLocale)}
                  </dt>
                  <dd className="tabular-nums">
                    {moneyLabel(data.driverFinance!.metrics[key], finLocale)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {state === "success" && data && data.items.length > 0 ? (
          <div data-testid="driver-wallets-table">
            <AdminDataTable>
              <AdminTableHead>
                <AdminTr>
                  <AdminTh>
                    {presentFinanceTerm("driverName", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("shortId", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("country", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("walletBalance", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("status", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("details", finLocale)}
                  </AdminTh>
                </AdminTr>
              </AdminTableHead>
              <tbody>
                {data.items.map((item) => (
                  <AdminTr key={item.walletId}>
                    <AdminTd>
                      <span className="font-medium text-slate-900">
                        {item.driverLabel?.trim() ||
                          shortId(item.driverId) ||
                          presentFinanceTerm("unavailable", finLocale)}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <span
                        className="font-mono text-xs text-slate-500"
                        title={item.driverId ?? item.walletId}
                      >
                        {shortId(item.driverId ?? item.walletId)}
                      </span>
                    </AdminTd>
                    <AdminTd>{item.countryId ?? "—"}</AdminTd>
                    <AdminTd>{balanceLabel(item, finLocale)}</AdminTd>
                    <AdminTd>
                      {item.status ? (
                        <StatusBadge value={item.status} />
                      ) : (
                        "—"
                      )}
                    </AdminTd>
                    <AdminTd>
                      <Link
                        href={`/finance/driver-wallets/${item.walletId}`}
                        className="text-emerald-800 underline"
                        data-testid={`wallet-link-${item.walletId}`}
                      >
                        {presentFinanceTerm("viewStatement", finLocale)}
                      </Link>
                    </AdminTd>
                  </AdminTr>
                ))}
              </tbody>
            </AdminDataTable>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
