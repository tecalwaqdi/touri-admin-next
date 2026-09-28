"use client";

import Link from "next/link";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { MetricCard } from "@/components/ui/MetricCard";
import { FinanceTermLabel } from "@/components/ui/FinanceTermLabel";
import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import type {
  CompanyFinanceMetrics,
  FinanceDashboardSummary,
  ReconciliationIndicatorReadModel,
  ReportMoney,
  SettlementListItem,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import { unavailableReportMoney } from "@/features/finance/formatReportMoney";
import { settlementsInLane } from "@/domain/finance/reporting/AccountantSettlementLanes";

function moneyTone(money: ReportMoney): "default" | "unavailable" | "warning" {
  if (money.availability === "available" && money.amountMinor != null) {
    return "default";
  }
  if (money.availability === "incomplete") return "warning";
  return "unavailable";
}

type Props = {
  locale: FinanceLocale;
  filterQs: string;
  dashboard: FinanceDashboardSummary & { driverNet?: ReportMoney };
  settlements: SettlementListItem[];
  reconciliation: ReconciliationIndicatorReadModel | null;
  driverId: string;
  dataClass?: string;
};

export function AccountantFinanceHome({
  locale,
  filterQs,
  dashboard,
  settlements,
  reconciliation,
  driverId,
  dataClass = "",
}: Props) {
  const explorerQs = dataClass
    ? `${filterQs}${filterQs ? "&" : ""}dataClass=${encodeURIComponent(dataClass)}`
    : filterQs;

  const needsPrepare = settlementsInLane(settlements, "needs_prepare").length;
  const awaitingApproval = settlementsInLane(
    settlements,
    "awaiting_approval",
  ).length;
  const awaitingPayment = settlementsInLane(
    settlements,
    "awaiting_payment",
  ).length;
  const paid = settlementsInLane(settlements, "paid").length;
  const reconciled = settlementsInLane(settlements, "reconciled").length;
  const open =
    needsPrepare +
    awaitingPayment +
    settlements.filter((s) => s.status === "partially_paid").length;

  const outstandingCash = settlements.filter((s) => {
    if (s.outstandingMinor == null) return false;
    try {
      return BigInt(s.outstandingMinor) > 0n;
    } catch {
      return false;
    }
  }).length;

  const historicalIncomplete = dashboard.historicalIncompleteCount ?? 0;
  const financialConflicts = dashboard.financialConflictCount ?? 0;
  const orphanLegacy = dashboard.orphanLegacySettlementCount ?? 0;
  const legacyReview =
    dashboard.legacySettlementsNeedingReviewCount ?? orphanLegacy;
  const reconVariance = dashboard.reconVarianceCount ?? 0;
  const reconBad =
    reconciliation?.status === "FAIL" || reconciliation?.status === "WARN";
  const reconCount = reconBad
    ? Math.max(reconciliation?.blockers?.length ?? 0, reconVariance, 1)
    : reconVariance;

  const exceptionTotal =
    (typeof historicalIncomplete === "number" ? historicalIncomplete : 0) +
    (typeof financialConflicts === "number" ? financialConflicts : 0) +
    orphanLegacy +
    (dashboard.certifiedReadyAwaitingSnapshotCount ?? 0);

  const actions = [
    needsPrepare > 0
      ? {
          label: presentFinanceTerm("settlementsNeedPrepare", locale),
          count: needsPrepare,
          href: `/settlements?lane=needs_prepare&${filterQs}`,
        }
      : null,
    awaitingApproval > 0
      ? {
          label: presentFinanceTerm("settlementsAwaitingApproval", locale),
          count: awaitingApproval,
          href: `/settlements?lane=awaiting_approval&${filterQs}`,
        }
      : null,
    awaitingPayment > 0
      ? {
          label: presentFinanceTerm("paymentsAwaitingConfirm", locale),
          count: awaitingPayment,
          href: `/settlements?lane=awaiting_payment&${filterQs}`,
        }
      : null,
    reconCount > 0
      ? {
          label: presentFinanceTerm("reconNeedsReview", locale),
          count: reconCount,
          href: `/finance/reconciliation?${filterQs}`,
        }
      : null,
    outstandingCash > 0
      ? {
          label: presentFinanceTerm("pendingCashCollections", locale),
          count: outstandingCash,
          href: `/finance/cash?${filterQs}`,
        }
      : null,
    exceptionTotal > 0
      ? {
          label: presentFinanceTerm("exceptionsNeedReview", locale),
          count: exceptionTotal,
          href: `/finance/exceptions?${filterQs}`,
        }
      : null,
    legacyReview > 0
      ? {
          label: presentFinanceTerm("legacySettlementsNeedingReview", locale),
          count: legacyReview,
          href: `/settlements?lane=historical&${filterQs}`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; count: number; href: string }>;

  const company = dashboard.company;
  const driverNet =
    dashboard.driverNet ?? unavailableReportMoney(dashboard.meta.currency);

  const primaryMoney: Array<{
    testId: string;
    labelKey: string;
    money: ReportMoney;
    href: string;
    useTermLabel?: boolean;
  }> = [
    {
      testId: "finance-metric-grossBookingValue",
      labelKey: "certifiedTripValue",
      money: company.grossBookingValue,
      href: `/reports?preset=daily&${filterQs}`,
    },
    {
      testId: "finance-metric-platformCommission",
      labelKey: "platformCommission",
      money: company.platformCommission,
      href: `/reports?preset=commission&${filterQs}`,
      useTermLabel: true,
    },
    {
      testId: "finance-metric-vatTax",
      labelKey: "vatTax",
      money: company.vatTax,
      href: `/reports?preset=vat&${filterQs}`,
      useTermLabel: true,
    },
    {
      testId: "finance-metric-driverNet",
      labelKey: "driverNetDue",
      money: driverNet,
      href: driverId.trim()
        ? `/finance/driver-wallets?driverId=${encodeURIComponent(driverId.trim())}`
        : `/finance/driver-wallets?${filterQs}`,
    },
    {
      testId: "finance-metric-collectedCash",
      labelKey: "collectedCash",
      money: company.collectedCash,
      href: `/finance/cash?${filterQs}`,
      useTermLabel: true,
    },
    {
      testId: "finance-metric-settled",
      labelKey: "paidSettlementsKpi",
      money: company.settled,
      href: `/settlements?lane=paid&${filterQs}`,
    },
    {
      testId: "finance-metric-outstanding",
      labelKey: "outstanding",
      money: company.outstanding,
      href: `/finance/reconciliation?${filterQs}`,
      useTermLabel: true,
    },
  ];

  const emptyMoney = (
    ["grossBookingValue", "platformCommission", "vatTax", "collectedCash"] as Array<
      keyof CompanyFinanceMetrics
    >
  ).every((key) => {
    const m = company[key];
    return (
      m.availability === "not_represented" ||
      m.availability === "missing" ||
      m.amountMinor == null
    );
  });
  const emptyCertified =
    emptyMoney &&
    (dashboard.meta.incompleteReasons.includes(
      "no_certified_accounting_snapshots",
    ) ||
      dashboard.meta.incompleteReasons.includes(
        "no_accounting_snapshots_in_window",
      ) ||
      dashboard.certifiedSnapshotCount === 0);
  const showBoundedWindow = dashboard.meta.incompleteReasons.includes(
    "bounded_financial_window",
  );
  const settlementsEmpty = settlements.length === 0 && open === 0;

  const settlementLanes = [
    {
      key: "needs_prepare",
      label: presentFinanceTerm("laneNeedsPrepare", locale),
      count: needsPrepare,
      href: `/settlements?lane=needs_prepare&${filterQs}`,
    },
    {
      key: "awaiting_approval",
      label: presentFinanceTerm("laneAwaitingApproval", locale),
      count: awaitingApproval,
      href: `/settlements?lane=awaiting_approval&${filterQs}`,
    },
    {
      key: "awaiting_payment",
      label: presentFinanceTerm("laneAwaitingPayment", locale),
      count: awaitingPayment,
      href: `/settlements?lane=awaiting_payment&${filterQs}`,
    },
    {
      key: "paid",
      label: presentFinanceTerm("lanePaid", locale),
      count: paid,
      href: `/settlements?lane=paid&${filterQs}`,
    },
    {
      key: "reconciled",
      label: presentFinanceTerm("laneReconciled", locale),
      count: reconciled,
      href: `/settlements?lane=reconciled&${filterQs}`,
    },
  ];

  const exceptionRows = [
    {
      key: "historical",
      label: presentFinanceTerm("historicalIncompleteCount", locale),
      value:
        historicalIncomplete === 0 &&
        dashboard.historicalIncompleteCount == null
          ? "—"
          : String(historicalIncomplete),
    },
    {
      key: "conflict",
      label: presentFinanceTerm("financialConflictsCount", locale),
      value:
        financialConflicts === 0 && dashboard.financialConflictCount == null
          ? "—"
          : String(financialConflicts),
    },
    {
      key: "orphan",
      label: presentFinanceTerm("orphanLegacyCountOnly", locale),
      value: String(orphanLegacy),
    },
    {
      key: "recon",
      label: presentFinanceTerm("reconDifferences", locale),
      value: reconciliation
        ? String(reconCount || reconciliation.status)
        : "—",
    },
    {
      key: "auto-finalize",
      label: presentFinanceTerm("autoFinalizeStatusLabel", locale),
      value: presentFinanceTerm("autoFinalizeStatusUnavailable", locale),
    },
  ];

  return (
    <div className="space-y-5" data-testid="accountant-finance-home">
      {showBoundedWindow ? (
        <p
          className="flex items-center gap-1.5 text-xs text-slate-500"
          data-testid="finance-bounded-window"
          title={presentFinanceTerm("boundedWindow", locale)}
        >
          <span
            aria-hidden
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold leading-none text-slate-500"
          >
            i
          </span>
          <span className="leading-snug">
            {presentFinanceTerm("boundedWindow", locale)}
          </span>
        </p>
      ) : null}

      <section data-testid="finance-group-accountant-kpis" className="space-y-2">
        {emptyCertified ? (
          <p
            data-testid="finance-accountant-empty-certified"
            className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            {presentFinanceTerm("emptyCertifiedForPeriod", locale)}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {primaryMoney.map((card) => (
            <MetricCard
              key={card.testId}
              testId={card.testId}
              href={card.href}
              label={
                card.useTermLabel ? (
                  <FinanceTermLabel termKey={card.labelKey} />
                ) : (
                  presentFinanceTerm(card.labelKey, locale)
                )
              }
              value={<MoneyCell money={card.money} />}
              tone={moneyTone(card.money)}
              hint={
                emptyCertified || moneyTone(card.money) === "default"
                  ? undefined
                  : presentFinanceTerm("dataUnavailable", locale)
              }
            />
          ))}
          <MetricCard
            testId="finance-metric-open-settlements"
            href={`/settlements?${filterQs}`}
            label={presentFinanceTerm("openSettlementsKpi", locale)}
            value={String(open)}
          />
        </div>
      </section>

      <section
        data-testid="finance-action-queue"
        className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4"
      >
        <h2 className="mb-2 text-sm font-semibold text-slate-900 sm:text-base">
          {presentFinanceTerm("actionQueue", locale)}
        </h2>
        {actions.length === 0 ? (
          <p
            className="text-sm text-slate-600"
            data-testid="finance-action-queue-empty"
          >
            {presentFinanceTerm("actionQueueEmpty", locale)}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {actions.map((a) => (
              <li key={a.href + a.label}>
                <Link
                  href={a.href}
                  className="flex items-center justify-between gap-3 rounded-md border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm text-slate-800 hover:border-emerald-400"
                >
                  <span>{a.label}</span>
                  <strong className="tabular-nums text-amber-900">
                    {a.count}
                  </strong>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <section
          data-testid="finance-settlement-summary"
          className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 lg:col-span-1"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {presentFinanceTerm("settlementSummary", locale)}
            </h2>
            <Link
              href={`/settlements?${filterQs}`}
              className="text-xs font-medium text-emerald-800 underline"
            >
              {presentFinanceTerm("openSettlements", locale)}
            </Link>
          </div>
          {settlementsEmpty ? (
            <p
              className="text-sm text-slate-600"
              data-testid="finance-settlements-empty"
            >
              {presentFinanceTerm("settlementsNotStartedPeriod", locale)}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {settlementLanes.map((lane) => (
                <li key={lane.key}>
                  <Link
                    href={lane.href}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50"
                  >
                    <span>{lane.label}</span>
                    <strong className="tabular-nums text-slate-900">
                      {lane.count}
                    </strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          data-testid="finance-exceptions-summary"
          className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 lg:col-span-1"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {presentFinanceTerm("exceptionsSummary", locale)}
            </h2>
            <Link
              href={`/finance/exceptions?${filterQs}`}
              className="text-xs font-medium text-emerald-800 underline"
            >
              {presentFinanceTerm("viewExceptions", locale)}
            </Link>
          </div>
          <ul className="space-y-1.5">
            {exceptionRows.map((row) => (
              <li
                key={row.key}
                className="flex items-start justify-between gap-2 px-2 py-1 text-sm text-slate-800"
              >
                <span className="text-slate-600">{row.label}</span>
                <strong className="shrink-0 tabular-nums text-slate-900">
                  {row.value}
                </strong>
              </li>
            ))}
          </ul>
          <Link
            href={`/finance/explorer?${explorerQs}`}
            className="mt-2 inline-block px-2 text-xs font-medium text-emerald-800 underline"
          >
            {presentFinanceTerm("viewInExplorer", locale)}
          </Link>
        </section>

        <section
          data-testid="finance-driver-summary"
          className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 lg:col-span-1"
        >
          <h2 className="mb-1 text-sm font-semibold text-slate-900">
            {presentFinanceTerm("driverAccountsSummary", locale)}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            {presentFinanceTerm("driverAccountsSummaryHint", locale)}
          </p>
          <div className="mb-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              {presentFinanceTerm("driverNetDue", locale)}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
              <MoneyCell money={driverNet} />
            </p>
          </div>
          <Link
            href={
              driverId.trim()
                ? `/finance/driver-wallets?driverId=${encodeURIComponent(driverId.trim())}`
                : `/finance/driver-wallets?${filterQs}`
            }
            className="inline-flex text-sm font-medium text-emerald-800 underline"
            data-testid="finance-open-driver-wallets"
          >
            {presentFinanceTerm("driverAccountsSummary", locale)}
          </Link>
        </section>
      </div>
    </div>
  );
}
