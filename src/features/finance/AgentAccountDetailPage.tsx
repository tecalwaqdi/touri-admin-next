"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ForbiddenState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FinanceTermLabel } from "@/components/ui/FinanceTermLabel";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { adminUi } from "@/components/ui/adminUi";
import type {
  AgentFinanceMetrics,
  AgentFinanceSummary,
  ReportMoney,
} from "@/domain/finance/reporting/FinanceReportingTypes";

const METRIC_KEYS = [
  "collectedCash",
  "companyAmountDue",
  "agentEntitlement",
  "adjustments",
  "settlementsDue",
  "paid",
  "outstanding",
  "disputed",
] as const satisfies ReadonlyArray<keyof AgentFinanceMetrics>;

export function AgentAccountDetailPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const params = useParams();
  const searchParams = useSearchParams();
  const agentId = String(params?.agentId ?? "");
  const countryId = searchParams?.get("countryId")?.trim() ?? "";

  const queryKey = useMemo(
    () => `agent-account:${agentId}:${countryId}`,
    [agentId, countryId],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams();
      qs.set("countryId", countryId);
      const res = await apiFetch(
        `/api/finance/agents/${encodeURIComponent(agentId)}?${qs}`,
        { signal },
      );
      if (res.status === 401 || res.status === 403) {
        throw new Error("forbidden");
      }
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      return (await res.json()) as AgentFinanceSummary;
    },
    [apiFetch, agentId, countryId, finLocale],
  );

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    enabled: Boolean(agentId && countryId),
  });

  const settlementsHref = `/settlements?agentId=${encodeURIComponent(agentId)}${
    countryId ? `&countryId=${encodeURIComponent(countryId)}` : ""
  }`;
  const ledgerHref = `/finance/ledger?agentId=${encodeURIComponent(agentId)}${
    countryId ? `&countryId=${encodeURIComponent(countryId)}` : ""
  }`;

  return (
    <AdminShell title={t("agentAccounts")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/finance", label: t("finance") },
            { href: "/finance/agents", label: t("agentAccounts") },
            { label: agentId || "—" },
          ]}
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className={adminUi.sectionTitle}>{t("agentAccounts")}</h1>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/finance/agents" className={adminUi.link}>
              {t("agentAccounts")}
            </Link>
            <Link href={settlementsHref} className={adminUi.link}>
              {t("settlements")}
            </Link>
            <Link href={ledgerHref} className={adminUi.link}>
              {t("financialLedger")}
            </Link>
          </div>
        </div>

        {!countryId ? (
          <EmptyState
            message={presentFinanceTerm("country", finLocale)}
          />
        ) : null}

        {countryId && state === "loading" ? <SkeletonBlock rows={6} /> : null}
        {error === "forbidden" ? (
          <ForbiddenState
            message={presentFinanceTerm("financeForbidden", finLocale)}
          />
        ) : null}
        {countryId && state === "empty" ? (
          <EmptyState
            message={presentFinanceTerm("noMatchingRecords", finLocale)}
          />
        ) : null}
        {countryId && state === "error" && error !== "forbidden" ? (
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

        {countryId && state === "success" && data ? (
          <div
            className="space-y-6"
            data-testid="agent-account-detail"
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">
                  {presentFinanceTerm("agentId", finLocale)}
                </dt>
                <dd className="font-medium" dir="ltr">
                  {data.agentIdToken}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  {presentFinanceTerm("country", finLocale)}
                </dt>
                <dd dir="ltr">{countryId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  {presentFinanceTerm("currency", finLocale)}
                </dt>
                <dd dir="ltr">{data.meta.currency ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  {presentFinanceTerm("status", finLocale)}
                </dt>
                <dd>
                  <StatusBadge value={data.metrics.attributionStatus} />
                </dd>
              </div>
            </dl>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {METRIC_KEYS.map((key) => {
                const money = data.metrics[key] as ReportMoney;
                return (
                  <MetricCard
                    key={key}
                    testId={`agent-metric-${key}`}
                    label={<FinanceTermLabel termKey={key} />}
                    value={<MoneyCell money={money} />}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
