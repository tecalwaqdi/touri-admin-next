"use client";

import { useCallback, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ErrorState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import type {
  CompanyFinanceMetrics,
  FinanceDashboardSummary,
  ReconciliationIndicatorReadModel,
  CorrectionVisibilityItem,
} from "@/domain/finance/reporting/FinanceReportingTypes";

const COMPANY_KEYS: Array<keyof CompanyFinanceMetrics> = [
  "grossBookingValue",
  "eligibleRevenue",
  "platformCommission",
  "companyAllocation",
  "vatTax",
  "gatewayFees",
  "refunds",
  "chargebacks",
  "adjustmentsMonetary",
  "reversals",
  "collectedCash",
  "electronicCardReceipts",
  "receivables",
  "payables",
  "settled",
  "outstanding",
  "disputedSuspense",
  "netRecognizedPosition",
];

export function FinancePage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [countryId, setCountryId] = useState("");
  const [currency, setCurrency] = useState("");

  const queryKey = useMemo(
    () => `fr7-dash:${countryId}:${currency}`,
    [countryId, currency],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currency) qs.set("currency", currency);
      const [dashRes, reconRes, corrRes] = await Promise.all([
        apiFetch(`/api/finance/dashboard?${qs}`, { signal }),
        apiFetch(`/api/finance/reconciliation?${qs}`, { signal }),
        apiFetch(`/api/finance/corrections?${qs}`, { signal }),
      ]);
      if (dashRes.status === 403 || reconRes.status === 403) {
        throw new Error(t("forbidden"));
      }
      if (!dashRes.ok) throw new Error("Failed to load FR7 finance dashboard");
      const dashboard = (await dashRes.json()) as FinanceDashboardSummary;
      const reconciliation = reconRes.ok
        ? ((await reconRes.json()) as ReconciliationIndicatorReadModel)
        : null;
      const corrections = corrRes.ok
        ? (((await corrRes.json()) as { items: CorrectionVisibilityItem[] }).items ?? [])
        : [];
      return { dashboard, reconciliation, corrections };
    },
    [apiFetch, countryId, currency, t],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 250,
  });

  return (
    <AdminShell title={t("finance")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb items={[{ label: t("finance") }]} />
        <div
          data-testid="fr7-source-badge"
          className="mb-4 inline-flex rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900"
        >
          FR7 FinanceReportingReadService
        </div>
        <div
          data-testid="synthetic-badge"
          className="mb-4 ms-2 inline-flex rounded-md bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-900"
        >
          {t("syntheticData")} / بيانات تجريبية
        </div>

        <div data-testid="finance-filters" className="mb-4 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <label className="text-sm">
            {t("country")}
            <select
              className="mt-1 block rounded border px-2 py-1"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
            >
              <option value="">All</option>
              <option value="SA">SA</option>
              <option value="AE">AE</option>
              <option value="EG">EG</option>
              <option value="KW">KW</option>
              <option value="JO">JO</option>
            </select>
          </label>
          <label className="text-sm">
            Currency
            <select
              data-testid="finance-currency-filter"
              className="mt-1 block rounded border px-2 py-1"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="">All (grouped)</option>
              <option value="SAR">SAR</option>
              <option value="AED">AED</option>
              <option value="EGP">EGP</option>
              <option value="KWD">KWD</option>
              <option value="JOD">JOD</option>
            </select>
          </label>
        </div>

        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock rows={6} />
        ) : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}

        {data?.dashboard ? (
          <div data-testid="finance-fr7-dashboard" className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span>
                Scope: <strong>{data.dashboard.meta.scope}</strong>
              </span>
              <span>
                Completeness:{" "}
                <StatusBadge value={data.dashboard.meta.sourceCompleteness} />
              </span>
              {data.reconciliation ? (
                <span data-testid="finance-recon-status">
                  Recon: <StatusBadge value={data.reconciliation.status} />
                </span>
              ) : null}
              <span>
                Settlements: {data.dashboard.settlementCount}
              </span>
            </div>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">
                Company metrics
              </h2>
              <div
                data-testid="finance-company-metrics"
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
              >
                {COMPANY_KEYS.map((key) => (
                  <MetricCard
                    key={key}
                    testId={`finance-metric-${key}`}
                    label={key}
                    value={<MoneyCell money={data.dashboard.company[key]} />}
                  />
                ))}
              </div>
            </section>

            <section data-testid="finance-currency-groups">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">
                By currency (no mix)
              </h2>
              {data.dashboard.byCurrency.length === 0 ? (
                <EmptyState message="No currency groups" />
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
                          Gross:{" "}
                          <MoneyCell money={group.company.grossBookingValue} />
                        </div>
                        <div>
                          Commission:{" "}
                          <MoneyCell money={group.company.platformCommission} />
                        </div>
                        <div>
                          Settled: <MoneyCell money={group.company.settled} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section data-testid="finance-corrections">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">
                Corrections visibility
              </h2>
              {data.corrections.length === 0 ? (
                <EmptyState message="No corrections" />
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-start">Kind</th>
                        <th className="px-3 py-2 text-start">Status</th>
                        <th className="px-3 py-2 text-start">Amount</th>
                        <th className="px-3 py-2 text-start">Monetary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.corrections.map((c) => (
                        <tr key={`${c.kind}-${c.id}`} className="border-t">
                          <td className="px-3 py-2">{c.kind}</td>
                          <td className="px-3 py-2">
                            <StatusBadge value={c.status} />
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {c.amountMinor == null
                              ? "Unknown"
                              : `${c.amountMinor} ${c.currency ?? ""}`}
                          </td>
                          <td className="px-3 py-2">
                            {c.monetaryEffect ? "yes" : "no (memo)"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
