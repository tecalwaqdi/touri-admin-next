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
  presentCorrectionKind,
  presentFinanceTerm,
  presentMoneyAvailability,
  presentReconBlocker,
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
import type {
  CorrectionVisibilityItem,
  FinanceDashboardSummary,
  ReconciliationIndicatorReadModel,
} from "@/domain/finance/reporting/FinanceReportingTypes";

type ExceptionsPayload = {
  dashboard: FinanceDashboardSummary;
  reconciliation: ReconciliationIndicatorReadModel | null;
  corrections: CorrectionVisibilityItem[];
};

export function FinancialExceptionsPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [countryId, setCountryId] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () => `financial-exceptions:${countryId}`,
    [countryId],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      const [dashRes, reconRes, corrRes] = await Promise.all([
        apiFetch(`/api/finance/dashboard?${qs}`, { signal }),
        apiFetch(`/api/finance/reconciliation?${qs}`, { signal }),
        apiFetch(`/api/finance/corrections?${qs}`, { signal }),
      ]);
      if (dashRes.status === 401 || dashRes.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!dashRes.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      const dashboard = (await dashRes.json()) as FinanceDashboardSummary;
      const reconciliation = reconRes.ok
        ? ((await reconRes.json()) as ReconciliationIndicatorReadModel)
        : null;
      const corrections = corrRes.ok
        ? (((await corrRes.json()) as { items: CorrectionVisibilityItem[] })
            .items ?? [])
        : [];
      return { dashboard, reconciliation, corrections } satisfies ExceptionsPayload;
    },
    [apiFetch, countryId, finLocale],
  );

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
  });

  const counters = data
    ? [
        {
          key: "historicalIncompleteCount",
          label: presentFinanceTerm("historicalIncompleteCount", finLocale),
          value: data.dashboard.historicalIncompleteCount ?? "—",
        },
        {
          key: "financialConflictCount",
          label: presentFinanceTerm("financialConflictsCount", finLocale),
          value: data.dashboard.financialConflictCount ?? "—",
        },
        {
          key: "reconVarianceCount",
          label: presentFinanceTerm("recon", finLocale),
          value: data.dashboard.reconVarianceCount ?? "—",
        },
        {
          key: "orphanLegacySettlementCount",
          label: presentFinanceTerm("orphanLegacyCountOnly", finLocale),
          value: data.dashboard.orphanLegacySettlementCount ?? "—",
        },
        {
          key: "unsettledCertified",
          label: presentFinanceTerm(
            "unsettledCertifiedCommercialSnapshotCount",
            finLocale,
          ),
          value:
            data.dashboard.unsettledCertifiedCommercialSnapshotCount ?? "—",
        },
        {
          key: "missingCertifiedSnapshot",
          label: presentFinanceTerm("missingCertifiedSnapshot", finLocale),
          value:
            data.dashboard.certifiedReadyAwaitingSnapshotCount ??
            data.dashboard.incompleteTripCount ??
            "—",
        },
      ]
    : [];

  return (
    <AdminShell title={t("financialExceptions")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/finance", label: t("finance") },
            { label: t("financialExceptions") },
          ]}
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className={adminUi.sectionTitle}>{t("financialExceptions")}</h1>
          <Link href="/finance" className={adminUi.link}>
            {t("finance")}
          </Link>
        </div>

        <p
          className="mb-4 max-w-3xl text-sm text-slate-600"
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          {presentFinanceTerm("autoFinalizeUnavailable", finLocale)}
        </p>

        <FilterBar>
          <FilterField label={presentFinanceTerm("country", finLocale)}>
            <FinanceCountryFilterSelect
              value={countryId}
              onChange={setCountryId}
              locale={locale}
              allLabel={t("allCountries")}
              testId="exceptions-country-filter"
              className={adminUi.filterControl}
            />
          </FilterField>
          <button
            type="button"
            className={adminUi.btnSecondary}
            onClick={() => reload()}
            data-testid="exceptions-reload"
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

        {state === "success" && data ? (
          <div
            className="space-y-6"
            data-testid="financial-exceptions"
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <section
              className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="exceptions-counters"
            >
              {counters.map((c) => (
                <div key={c.key}>
                  <p className="text-xs text-slate-500">{c.label}</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {c.value}
                  </p>
                </div>
              ))}
            </section>

            {data.reconciliation ? (
              <section
                className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
                data-testid="exceptions-recon"
              >
                <h2 className="mb-2 text-lg font-semibold text-slate-900">
                  {presentFinanceTerm("financialReconciliation", finLocale)}
                </h2>
                <p className="mb-2">
                  {presentFinanceTerm("status", finLocale)}:{" "}
                  <StatusBadge value={data.reconciliation.status} />
                </p>
                <ul className="grid gap-1 sm:grid-cols-3">
                  <li>
                    {presentFinanceTerm(
                      "snapshotMatchesSettlement",
                      finLocale,
                    )}
                    :{" "}
                    {data.reconciliation.snapshotMatchesSettlement == null
                      ? "—"
                      : String(data.reconciliation.snapshotMatchesSettlement)}
                  </li>
                  <li>
                    {presentFinanceTerm("claimMatchesCommission", finLocale)}:{" "}
                    {data.reconciliation.claimMatchesCommission == null
                      ? "—"
                      : String(data.reconciliation.claimMatchesCommission)}
                  </li>
                  <li>
                    {presentFinanceTerm("outstandingConsistent", finLocale)}:{" "}
                    {data.reconciliation.outstandingConsistent == null
                      ? "—"
                      : String(data.reconciliation.outstandingConsistent)}
                  </li>
                </ul>
                {data.reconciliation.blockers.length > 0 ? (
                  <ul className="mt-2 list-disc ps-5 text-amber-900">
                    {data.reconciliation.blockers.map((b) => (
                      <li key={b} title={b}>
                        {presentReconBlocker(b, finLocale)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            <section data-testid="exceptions-corrections">
              <h2 className="mb-3 text-lg font-semibold text-slate-900">
                {presentFinanceTerm("correctionsSection", finLocale)}
              </h2>
              {data.corrections.length === 0 ? (
                <EmptyState
                  message={presentFinanceTerm("noMatchingRecords", finLocale)}
                />
              ) : (
                <AdminDataTable>
                  <AdminTableHead>
                    <tr>
                      <AdminTh>
                        {presentFinanceTerm("kind", finLocale)}
                      </AdminTh>
                      <AdminTh>
                        {presentFinanceTerm("status", finLocale)}
                      </AdminTh>
                      <AdminTh>
                        {presentFinanceTerm("amount", finLocale)}
                      </AdminTh>
                      <AdminTh>
                        {presentFinanceTerm("monetaryEffect", finLocale)}
                      </AdminTh>
                      <AdminTh>
                        {presentFinanceTerm("relatedSettlementId", finLocale)}
                      </AdminTh>
                    </tr>
                  </AdminTableHead>
                  <tbody>
                    {data.corrections.map((c) => (
                      <AdminTr key={`${c.kind}-${c.id}`}>
                        <AdminTd>
                          {presentCorrectionKind(c.kind, finLocale, {
                            directionOrKind: c.directionOrKind,
                            monetaryEffect: c.monetaryEffect,
                          })}
                        </AdminTd>
                        <AdminTd>
                          <StatusBadge value={c.status} />
                        </AdminTd>
                        <AdminTd className="tabular-nums">
                          {!c.monetaryEffect
                            ? presentFinanceTerm("neutralMemo", finLocale)
                            : c.amountMinor == null
                              ? presentMoneyAvailability("missing", finLocale)
                              : formatMinorUnitsDisplay(
                                  c.amountMinor,
                                  c.currency,
                                )}
                        </AdminTd>
                        <AdminTd>
                          {c.monetaryEffect
                            ? presentFinanceTerm("monetaryYes", finLocale)
                            : presentFinanceTerm("monetaryNo", finLocale)}
                        </AdminTd>
                        <AdminTd>
                          <span dir="ltr">
                            {c.relatedSettlementId ?? "—"}
                          </span>
                        </AdminTd>
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
