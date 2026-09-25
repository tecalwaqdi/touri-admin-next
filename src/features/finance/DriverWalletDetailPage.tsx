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
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import type { DriverWalletDetail } from "@/domain/finance/wallet/DriverWalletReadModels";
import type {
  DriverFinanceSummary,
  ReportMoney,
  SettlementListItem,
} from "@/domain/finance/reporting/FinanceReportingTypes";

type StatementPayload = {
  wallet: DriverWalletDetail;
  finance: DriverFinanceSummary | null;
  settlements: SettlementListItem[];
};

function moneyLabel(m: ReportMoney | undefined, locale: FinanceLocale): string {
  if (!m || m.amountMinor == null || m.availability !== "available") {
    return presentMoneyAvailability(m?.availability ?? "unknown", locale);
  }
  return formatMinorUnitsDisplay(m.amountMinor, m.currency);
}

export function DriverWalletDetailPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const params = useParams();
  const walletId = String(params?.id ?? "");

  const queryKey = useMemo(() => `driver-wallet-statement:${walletId}`, [walletId]);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch(`/api/finance/driver-wallets/${walletId}`, {
        signal,
      });
      if (res.status === 403) throw new Error("forbidden");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`wallet_detail_failed:${res.status}`);
      const wallet = (await res.json()) as DriverWalletDetail;
      const driverId = wallet.wallet.driverId;
      let finance: DriverFinanceSummary | null = null;
      let settlements: SettlementListItem[] = [];
      if (driverId) {
        const [finRes, settRes] = await Promise.all([
          apiFetch(`/api/finance/drivers/${encodeURIComponent(driverId)}`, {
            signal,
          }),
          apiFetch(
            `/api/finance/settlements?driverId=${encodeURIComponent(driverId)}&locale=${encodeURIComponent(finLocale)}`,
            { signal },
          ),
        ]);
        if (finRes.ok) {
          finance = (await finRes.json()) as DriverFinanceSummary;
        }
        if (settRes.ok) {
          const body = (await settRes.json()) as { items: SettlementListItem[] };
          settlements = (body.items ?? []).filter((s) => s.partyType === "driver");
        }
      }
      return { wallet, finance, settlements } satisfies StatementPayload;
    },
    [apiFetch, walletId, finLocale],
  );

  const { data, state, error } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    enabled: Boolean(walletId),
  });

  const balanceLabel = () => {
    if (!data) return "—";
    const b = data.wallet.wallet.balance;
    if (b.amountMinor == null || b.availability !== "available") {
      return presentMoneyAvailability(b.availability, finLocale);
    }
    return formatMinorUnitsDisplay(b.amountMinor, data.wallet.wallet.currency);
  };

  const driverId = data?.wallet.wallet.driverId;

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
        <h1 className={`${adminUi.sectionTitle} mb-4`}>
          {presentFinanceTerm("driverAccountStatement", finLocale)}
        </h1>
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
          <div className="space-y-6" data-testid="wallet-detail" dir={locale === "ar" ? "rtl" : "ltr"}>
            <p className={`${adminUi.caption} text-slate-600`}>
              {presentFinanceTerm("driverWalletsSotNote", finLocale)}
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">
                  {presentFinanceTerm("driverId", finLocale)}
                </dt>
                <dd>{driverId ?? "—"}</dd>
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
                <dd>{data.wallet.wallet.status ?? "—"}</dd>
              </div>
            </dl>

            {data.finance ? (
              <section data-testid="driver-finance-summary">
                <h2 className="mb-2 text-lg font-semibold">
                  {presentFinanceTerm("driverFinance", finLocale)}
                </h2>
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                        {moneyLabel(data.finance!.metrics[key], finLocale)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {driverId ? (
              <p className="text-sm">
                <Link
                  href={`/settlements?driverId=${encodeURIComponent(driverId)}`}
                  className="text-emerald-800 underline"
                >
                  {presentFinanceTerm("settlementHistory", finLocale)}
                </Link>
                {" · "}
                <Link
                  href={`/finance/ledger?driverId=${encodeURIComponent(driverId)}`}
                  className="text-emerald-800 underline"
                >
                  {presentFinanceTerm("financialLedger", finLocale)}
                </Link>
                {" · "}
                <Link
                  href={`/reports?preset=driver_statement&driverId=${encodeURIComponent(driverId)}`}
                  className="text-emerald-800 underline"
                >
                  {presentFinanceTerm("reportPresetDriverStatement", finLocale)}
                </Link>
              </p>
            ) : null}

            {data.settlements.length > 0 ? (
              <section data-testid="driver-settlement-history">
                <h2 className="mb-2 text-lg font-semibold">
                  {presentFinanceTerm("settlementHistory", finLocale)}
                </h2>
                <AdminDataTable>
                  <AdminTableHead>
                    <AdminTr>
                      <AdminTh>{presentFinanceTerm("settlementId", finLocale)}</AdminTh>
                      <AdminTh>{presentFinanceTerm("status", finLocale)}</AdminTh>
                      <AdminTh>{presentFinanceTerm("settlementAmount", finLocale)}</AdminTh>
                      <AdminTh>{presentFinanceTerm("outstanding", finLocale)}</AdminTh>
                    </AdminTr>
                  </AdminTableHead>
                  <tbody>
                    {data.settlements.map((s) => (
                      <AdminTr key={s.id}>
                        <AdminTd>
                          <Link
                            href={`/settlements/${s.id}`}
                            className="text-emerald-800 underline"
                          >
                            {s.id}
                          </Link>
                        </AdminTd>
                        <AdminTd>
                          <StatusBadge value={s.status} />
                        </AdminTd>
                        <AdminTd>
                          {s.amountMinor == null
                            ? presentMoneyAvailability("missing", finLocale)
                            : formatMinorUnitsDisplay(s.amountMinor, s.currency)}
                        </AdminTd>
                        <AdminTd>
                          {s.outstandingMinor == null
                            ? presentMoneyAvailability("missing", finLocale)
                            : formatMinorUnitsDisplay(
                                s.outstandingMinor,
                                s.currency,
                              )}
                        </AdminTd>
                      </AdminTr>
                    ))}
                  </tbody>
                </AdminDataTable>
              </section>
            ) : null}

            <section>
              <h2 className="mb-2 text-lg font-semibold">
                {presentFinanceTerm("walletLedger", finLocale)}
              </h2>
              {data.wallet.ledger.length === 0 ? (
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
                    {data.wallet.ledger.map((row) => (
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

            <details className="rounded-lg border bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm text-slate-700">
                {presentFinanceTerm("technicalIds", finLocale)}
              </summary>
              <p className="mt-2 font-mono text-xs text-slate-500">
                {data.wallet.wallet.walletId}
              </p>
            </details>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
