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
import type { DriverWalletListItem } from "@/domain/finance/wallet/DriverWalletReadModels";

type ListResponse = {
  items: DriverWalletListItem[];
  warnings?: string[];
  mode?: string;
};

function balanceLabel(
  item: DriverWalletListItem,
  locale: FinanceLocale,
): string {
  if (
    item.balance.amountMinor == null ||
    item.balance.availability !== "available"
  ) {
    return presentMoneyAvailability(item.balance.availability, locale);
  }
  return formatMinorUnitsDisplay(item.balance.amountMinor, item.currency);
}

export function DriverWalletsPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [driverId, setDriverId] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(() => `driver-wallets:${driverId}`, [driverId]);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (driverId.trim()) qs.set("driverId", driverId.trim());
      const res = await apiFetch(`/api/finance/driver-wallets?${qs}`, {
        signal,
      });
      if (res.status === 403) {
        setForbidden(true);
        throw new Error("forbidden");
      }
      if (!res.ok) throw new Error(`wallet_list_failed:${res.status}`);
      return (await res.json()) as ListResponse;
    },
    [apiFetch, driverId],
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className={adminUi.sectionTitle}>{t("driverWallets")}</h1>
          <Link
            href="/finance"
            className="text-sm text-emerald-800 underline"
            data-testid="wallets-back-finance"
          >
            {t("finance")}
          </Link>
        </div>

        <p
          className="mb-4 max-w-3xl text-sm text-slate-600"
          data-testid="wallets-sot-note"
        >
          {presentFinanceTerm("driverWalletsSotNote", finLocale)}
        </p>

        <FilterBar>
          <FilterField label={presentFinanceTerm("driverId", finLocale)}>
            <input
              className={adminUi.filterControl}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              placeholder={presentFinanceTerm("driverId", finLocale)}
              data-testid="wallets-driver-filter"
            />
          </FilterField>
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
            message={presentFinanceTerm("noMatchingRecords", finLocale)}
          />
        ) : null}

        {state === "success" && data && data.items.length > 0 ? (
          <div data-testid="driver-wallets-table">
            {data.warnings?.includes("bounded_wallet_window") ? (
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                {presentFinanceTerm("boundedWindow", finLocale)}
              </p>
            ) : null}
            <AdminDataTable>
              <AdminTableHead>
                <AdminTr>
                  <AdminTh>{presentFinanceTerm("id", finLocale)}</AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("driverId", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("walletBalance", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("currency", finLocale)}
                  </AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("status", finLocale)}
                  </AdminTh>
                </AdminTr>
              </AdminTableHead>
              <tbody>
                {data.items.map((item) => (
                  <AdminTr key={item.walletId}>
                    <AdminTd>
                      <Link
                        href={`/finance/driver-wallets/${item.walletId}`}
                        className="text-emerald-800 underline"
                        data-testid={`wallet-link-${item.walletId}`}
                      >
                        {item.walletId}
                      </Link>
                    </AdminTd>
                    <AdminTd>{item.driverId ?? "—"}</AdminTd>
                    <AdminTd>{balanceLabel(item, finLocale)}</AdminTd>
                    <AdminTd>{item.currency ?? "—"}</AdminTd>
                    <AdminTd>
                      {item.status ? (
                        <StatusBadge value={item.status} />
                      ) : (
                        "—"
                      )}
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
