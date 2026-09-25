"use client";

import Link from "next/link";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
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

function moneyTone(money: ReportMoney): "default" | "unavailable" | "warning" {
  if (money.availability === "available" && money.amountMinor != null) {
    return "default";
  }
  if (money.availability === "incomplete") return "warning";
  return "unavailable";
}

function moneyWhy(money: ReportMoney, locale: FinanceLocale): string | undefined {
  if (money.availability === "available" && money.amountMinor != null) {
    return undefined;
  }
  if (money.availability === "not_represented") {
    return presentFinanceTerm("availabilityWhyNotRepresented", locale);
  }
  if (money.availability === "incomplete") {
    return presentFinanceTerm("availabilityWhyIncomplete", locale);
  }
  return presentFinanceTerm("availabilityWhyMissing", locale);
}

type Props = {
  locale: FinanceLocale;
  filterQs: string;
  dashboard: FinanceDashboardSummary & { driverNet?: ReportMoney };
  settlements: SettlementListItem[];
  reconciliation: ReconciliationIndicatorReadModel | null;
  driverId: string;
};

export function AccountantFinanceHome({
  locale,
  filterQs,
  dashboard,
  settlements,
  reconciliation,
  driverId,
}: Props) {
  const draft = settlements.filter((s) => s.status === "draft").length;
  const locked = settlements.filter((s) => s.status === "locked").length;
  const open = settlements.filter(
    (s) =>
      s.status === "draft" ||
      s.status === "locked" ||
      s.status === "partially_paid",
  ).length;
  const outstandingCash = settlements.filter((s) => {
    if (s.outstandingMinor == null) return false;
    try {
      return BigInt(s.outstandingMinor) > 0n;
    } catch {
      return false;
    }
  }).length;
  const exceptions =
    (dashboard.historicalIncompleteCount ?? 0) +
    (dashboard.financialConflictCount ?? 0) +
    (dashboard.certifiedReadyAwaitingSnapshotCount ?? 0) +
    (dashboard.orphanLegacySettlementCount ?? 0);
  const reconBad =
    reconciliation?.status === "FAIL" || reconciliation?.status === "WARN";

  const actions = [
    draft > 0
      ? {
          label: presentFinanceTerm("settlementsNeedPrepare", locale),
          count: draft,
          href: `/settlements?lane=needs_prepare&${filterQs}`,
        }
      : null,
    draft > 0
      ? {
          label: presentFinanceTerm("settlementsAwaitingApproval", locale),
          count: draft,
          href: `/settlements?lane=awaiting_approval&${filterQs}`,
        }
      : null,
    locked > 0
      ? {
          label: presentFinanceTerm("paymentsAwaitingConfirm", locale),
          count: locked,
          href: `/settlements?lane=awaiting_payment&${filterQs}`,
        }
      : null,
    reconBad
      ? {
          label: presentFinanceTerm("reconNeedsReview", locale),
          count: reconciliation?.blockers?.length ?? 1,
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
    exceptions > 0
      ? {
          label: presentFinanceTerm("exceptionsNeedReview", locale),
          count: exceptions,
          href: `/finance/exceptions?${filterQs}`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; count: number; href: string }>;

  const company = dashboard.company;
  const driverNet =
    dashboard.driverNet ?? unavailableReportMoney(dashboard.meta.currency);

  const moneyCards: Array<{
    testId: string;
    labelKey: string;
    money: ReportMoney;
    href: string;
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
    },
    {
      testId: "finance-metric-vatTax",
      labelKey: "vatTax",
      money: company.vatTax,
      href: `/reports?preset=vat&${filterQs}`,
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
    },
    {
      testId: "finance-metric-settled",
      labelKey: "settled",
      money: company.settled,
      href: `/settlements?lane=paid&${filterQs}`,
    },
    {
      testId: "finance-metric-outstanding",
      labelKey: "outstanding",
      money: company.outstanding,
      href: `/finance/reconciliation?${filterQs}`,
    },
  ];

  const emptyCertified =
    dashboard.meta.incompleteReasons.includes(
      "no_certified_accounting_snapshots",
    ) &&
    (["grossBookingValue", "platformCommission", "vatTax", "collectedCash"] as Array<
      keyof CompanyFinanceMetrics
    >).every((key) => {
      const m = company[key];
      return (
        m.availability === "not_represented" ||
        m.availability === "missing" ||
        m.amountMinor == null
      );
    });

  return (
    <div className="space-y-4" data-testid="accountant-finance-home">
      <p
        className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
        data-testid="finance-compact-notice"
      >
        {presentFinanceTerm("compactSampleNotice", locale)}
      </p>

      <section
        data-testid="finance-action-queue"
        className="rounded-lg border border-amber-200 bg-amber-50/70 p-4"
      >
        <h2 className="mb-3 text-base font-semibold text-slate-900">
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
                  className="flex items-center justify-between gap-3 rounded-md border border-amber-100 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm hover:border-emerald-400"
                >
                  <span>{a.label}</span>
                  <strong className="tabular-nums text-amber-900">{a.count}</strong>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="finance-group-accountant-kpis">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {presentFinanceTerm("financeSummary", locale)}
        </h2>
        {emptyCertified ? (
          <p
            data-testid="finance-accountant-empty-certified"
            className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-700"
          >
            {presentFinanceTerm("emptyCertifiedTripsPeriod", locale)}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {moneyCards.map((card) => (
              <MetricCard
                key={card.testId}
                testId={card.testId}
                href={card.href}
                label={
                  card.labelKey === "platformCommission" ||
                  card.labelKey === "vatTax" ||
                  card.labelKey === "collectedCash" ||
                  card.labelKey === "settled" ||
                  card.labelKey === "outstanding" ? (
                    <FinanceTermLabel termKey={card.labelKey} />
                  ) : (
                    presentFinanceTerm(card.labelKey, locale)
                  )
                }
                value={<MoneyCell money={card.money} />}
                tone={moneyTone(card.money)}
                hint={moneyWhy(card.money, locale)}
              />
            ))}
            <MetricCard
              testId="finance-metric-open-settlements"
              href={`/settlements?${filterQs}`}
              label={presentFinanceTerm("openSettlementsCount", locale)}
              value={String(open)}
            />
            <MetricCard
              testId="finance-metric-awaiting-approval"
              href={`/settlements?lane=awaiting_approval&${filterQs}`}
              label={presentFinanceTerm("awaitingApprovalCount", locale)}
              value={String(draft)}
            />
            <MetricCard
              testId="finance-metric-awaiting-payment"
              href={`/settlements?lane=awaiting_payment&${filterQs}`}
              label={presentFinanceTerm("awaitingPaymentCount", locale)}
              value={String(locked)}
            />
            <MetricCard
              testId="finance-metric-recon"
              href={`/finance/reconciliation?${filterQs}`}
              label={presentFinanceTerm("reconDifferences", locale)}
              value={
                reconciliation ? (
                  <StatusBadge value={reconciliation.status} />
                ) : (
                  "—"
                )
              }
              tone={reconBad ? "warning" : "default"}
            />
            <MetricCard
              testId="finance-metric-exceptions"
              href={`/finance/exceptions?${filterQs}`}
              label={presentFinanceTerm("financialExceptions", locale)}
              value={String(exceptions)}
              tone={exceptions > 0 ? "warning" : "default"}
            />
          </div>
        )}
      </section>
    </div>
  );
}
