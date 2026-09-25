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
import {
  presentSettlementPartyPrimary,
  presentSettlementPartyTitle,
} from "@/features/settlements/settlementPartyPresentation";
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
  ReconciliationIndicatorReadModel,
  SettlementListItem,
} from "@/domain/finance/reporting/FinanceReportingTypes";

type ReconPayload = {
  settlements: SettlementListItem[];
  reconciliation: ReconciliationIndicatorReadModel | null;
};

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

function isOutstandingZero(outstandingMinor: string | null): boolean {
  if (outstandingMinor == null) return false;
  try {
    return BigInt(outstandingMinor) === 0n;
  } catch {
    return false;
  }
}

function isUnresolved(row: SettlementListItem): boolean {
  if (row.outstandingMinor == null) return true;
  return !isOutstandingZero(row.outstandingMinor);
}

export function FinancialReconciliationPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [countryId, setCountryId] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () => `financial-recon:${countryId}`,
    [countryId],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      qs.set("locale", finLocale);
      const [settRes, reconRes] = await Promise.all([
        apiFetch(`/api/finance/settlements?${qs}`, { signal }),
        apiFetch(`/api/finance/reconciliation?${qs}`, { signal }),
      ]);
      if (settRes.status === 401 || settRes.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!settRes.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      const settlements = (
        (await settRes.json()) as { items: SettlementListItem[] }
      ).items;
      const reconciliation = reconRes.ok
        ? ((await reconRes.json()) as ReconciliationIndicatorReadModel)
        : null;
      return { settlements, reconciliation } satisfies ReconPayload;
    },
    [apiFetch, countryId, finLocale],
  );

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
  });

  const rows = useMemo(() => {
    const items = data?.settlements ?? [];
    return unresolvedOnly ? items.filter(isUnresolved) : items;
  }, [data?.settlements, unresolvedOnly]);

  return (
    <AdminShell title={t("financialReconciliation")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/finance", label: t("finance") },
            { label: t("financialReconciliation") },
          ]}
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className={adminUi.sectionTitle}>
            {t("financialReconciliation")}
          </h1>
          <Link href="/finance" className={adminUi.link}>
            {t("finance")}
          </Link>
        </div>

        {data?.reconciliation ? (
          <div
            className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700"
            dir={locale === "ar" ? "rtl" : "ltr"}
            data-testid="recon-indicators"
          >
            <p className="mb-2 font-medium text-slate-900">
              {presentFinanceTerm("recon", finLocale)}:{" "}
              <StatusBadge value={data.reconciliation.status} />
            </p>
            <ul className="grid gap-1 sm:grid-cols-3">
              <li>
                {presentFinanceTerm("snapshotMatchesSettlement", finLocale)}:{" "}
                {data.reconciliation.snapshotMatchesSettlement == null
                  ? "—"
                  : data.reconciliation.snapshotMatchesSettlement
                    ? "✓"
                    : "✗"}
              </li>
              <li>
                {presentFinanceTerm("claimMatchesCommission", finLocale)}:{" "}
                {data.reconciliation.claimMatchesCommission == null
                  ? "—"
                  : data.reconciliation.claimMatchesCommission
                    ? "✓"
                    : "✗"}
              </li>
              <li>
                {presentFinanceTerm("outstandingConsistent", finLocale)}:{" "}
                {data.reconciliation.outstandingConsistent == null
                  ? "—"
                  : data.reconciliation.outstandingConsistent
                    ? "✓"
                    : "✗"}
              </li>
            </ul>
          </div>
        ) : null}

        <FilterBar>
          <FilterField label={presentFinanceTerm("country", finLocale)}>
            <FinanceCountryFilterSelect
              value={countryId}
              onChange={setCountryId}
              locale={locale}
              allLabel={t("allCountries")}
              testId="recon-country-filter"
              className={adminUi.filterControl}
            />
          </FilterField>
          <FilterField label={presentFinanceTerm("unresolvedOnly", finLocale)}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={unresolvedOnly}
                onChange={(e) => setUnresolvedOnly(e.target.checked)}
                data-testid="recon-unresolved-only"
              />
              {presentFinanceTerm("unresolvedOnly", finLocale)}
            </label>
          </FilterField>
          <button
            type="button"
            className={adminUi.btnSecondary}
            onClick={() => reload()}
            data-testid="recon-reload"
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
        {state === "success" && rows.length === 0 ? (
          <EmptyState
            message={presentFinanceTerm("noMatchingRecords", finLocale)}
          />
        ) : null}

        {state === "success" && rows.length > 0 ? (
          <AdminDataTable testId="financial-recon-table">
            <AdminTableHead>
              <tr>
                <AdminTh>
                  {presentFinanceTerm("settlementId", finLocale)}
                </AdminTh>
                <AdminTh>{presentFinanceTerm("party", finLocale)}</AdminTh>
                <AdminTh>
                  {presentFinanceTerm("expectedAmount", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("recordedPayment", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("differenceAmount", finLocale)}
                </AdminTh>
                <AdminTh>{presentFinanceTerm("status", finLocale)}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {rows.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd className={adminUi.monoId} title={row.id}>
                    <Link
                      className={adminUi.link}
                      href={`/settlements/${row.id}`}
                    >
                      <span className={adminUi.truncate} dir="ltr">
                        {row.id}
                      </span>
                    </Link>
                  </AdminTd>
                  <AdminTd
                    title={presentSettlementPartyTitle({
                      partyType: row.partyType,
                      partyLabel: row.partyLabel,
                      partyIdToken: row.partyIdToken,
                    })}
                  >
                    {presentSettlementPartyPrimary({
                      partyType: row.partyType,
                      partyLabel: row.partyLabel,
                      partyIdToken: row.partyIdToken,
                      locale: finLocale,
                    })}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(row.amountMinor, row.currency, finLocale)}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(
                      row.paidConfirmedMinor,
                      row.currency,
                      finLocale,
                    )}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(
                      row.outstandingMinor,
                      row.currency,
                      finLocale,
                    )}
                  </AdminTd>
                  <AdminTd>
                    {isOutstandingZero(row.outstandingMinor) ? (
                      presentFinanceTerm("reconciledStatus", finLocale)
                    ) : (
                      <StatusBadge value={row.status} />
                    )}
                  </AdminTd>
                </AdminTr>
              ))}
            </tbody>
          </AdminDataTable>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
