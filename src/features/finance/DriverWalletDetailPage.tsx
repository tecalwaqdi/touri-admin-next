"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ForbiddenState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { formatMinorUnitsDisplay } from "@/features/finance/formatReportMoney";
import {
  presentFinanceTerm,
  presentMoneyAvailability,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import type { DriverWalletDetail } from "@/domain/finance/wallet/DriverWalletReadModels";

export function DriverWalletDetailPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const params = useParams();
  const walletId = String(params?.id ?? "");

  const queryKey = useMemo(() => `driver-wallet:${walletId}`, [walletId]);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch(`/api/finance/driver-wallets/${walletId}`, {
        signal,
      });
      if (res.status === 403) throw new Error("forbidden");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`wallet_detail_failed:${res.status}`);
      return (await res.json()) as DriverWalletDetail;
    },
    [apiFetch, walletId],
  );

  const { data, state, error } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    enabled: Boolean(walletId),
  });

  const balanceLabel = () => {
    if (!data) return "—";
    const b = data.wallet.balance;
    if (b.amountMinor == null || b.availability !== "available") {
      return presentMoneyAvailability(b.availability, finLocale);
    }
    return formatMinorUnitsDisplay(b.amountMinor, data.wallet.currency);
  };

  return (
    <AdminShell title={t("driverWallets")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/finance", label: t("finance") },
            { href: "/finance/driver-wallets", label: t("driverWallets") },
            { label: walletId },
          ]}
        />
        <h1 className={`${adminUi.sectionTitle} mb-4`}>{t("driverWallets")}</h1>
        <Link
          href="/finance/driver-wallets"
          className="mb-4 inline-block text-sm text-emerald-800 underline"
        >
          {t("driverWallets")}
        </Link>

        {error === "forbidden" ? <ForbiddenState /> : null}
        {state === "loading" ? <SkeletonBlock rows={6} /> : null}
        {state === "empty" ? (
          <EmptyState
            message={presentFinanceTerm("noMatchingRecords", finLocale)}
          />
        ) : null}
        {state === "error" && error !== "forbidden" ? (
          <UnavailableState message={error} />
        ) : null}

        {state === "success" && data ? (
          <div className="space-y-6" data-testid="wallet-detail">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">
                  {presentFinanceTerm("id", finLocale)}
                </dt>
                <dd className="font-medium">{data.wallet.walletId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  {presentFinanceTerm("driverId", finLocale)}
                </dt>
                <dd>{data.wallet.driverId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  {presentFinanceTerm("walletBalance", finLocale)}
                </dt>
                <dd data-testid="wallet-balance">{balanceLabel()}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  {presentFinanceTerm("status", finLocale)}
                </dt>
                <dd>{data.wallet.status ?? "—"}</dd>
              </div>
            </dl>

            <section>
              <h2 className="mb-2 text-lg font-semibold">
                {presentFinanceTerm("walletLedger", finLocale)}
              </h2>
              {data.ledger.length === 0 ? (
                <EmptyState
                  message={presentFinanceTerm("noMatchingRecords", finLocale)}
                />
              ) : (
                <AdminDataTable>
                  <AdminTableHead>
                    <AdminTr>
                      <AdminTh>
                        {presentFinanceTerm("id", finLocale)}
                      </AdminTh>
                      <AdminTh>
                        {presentFinanceTerm("amount", finLocale)}
                      </AdminTh>
                      <AdminTh>
                        {presentFinanceTerm("ledgerType", finLocale)}
                      </AdminTh>
                      <AdminTh>
                        {presentFinanceTerm("direction", finLocale)}
                      </AdminTh>
                    </AdminTr>
                  </AdminTableHead>
                  <tbody>
                    {data.ledger.map((row) => (
                      <AdminTr key={row.transactionId}>
                        <AdminTd>{row.transactionId}</AdminTd>
                        <AdminTd>
                          {row.amountMinor == null ||
                          row.availability !== "available"
                            ? presentMoneyAvailability(
                                row.availability,
                                finLocale,
                              )
                            : formatMinorUnitsDisplay(
                                row.amountMinor,
                                row.currency,
                              )}
                        </AdminTd>
                        <AdminTd>{row.type ?? "—"}</AdminTd>
                        <AdminTd>{row.direction ?? "—"}</AdminTd>
                      </AdminTr>
                    ))}
                  </tbody>
                </AdminDataTable>
              )}
            </section>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
