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
import { FinancePartyNameFilter } from "@/components/ui/FinancePartyNameFilter";
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
import { FormattedDateTime } from "@/components/i18n/FormattedDateTime";
import type { FinancialMovementRow } from "@/domain/finance/reporting/AccountantFinancialLedger";

type ListResponse = { items: FinancialMovementRow[]; bounded?: boolean };

function moneyLabel(
  amountMinor: string | null,
  currency: string | null,
  locale: FinanceLocale,
): string {
  if (amountMinor == null) {
    return presentMoneyAvailability("missing", locale);
  }
  return formatMinorUnitsDisplay(amountMinor, currency);
}

function directionLabel(
  direction: FinancialMovementRow["direction"],
  locale: FinanceLocale,
): string {
  if (direction === "debit") return presentFinanceTerm("movementDebit", locale);
  if (direction === "credit")
    return presentFinanceTerm("movementCredit", locale);
  return "—";
}

export function FinancialLedgerPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [countryId, setCountryId] = useState("");
  const [currency, setCurrency] = useState("");
  const [driverId, setDriverId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () =>
      `financial-ledger:${countryId}:${currency}:${driverId}:${agentId}:${periodFrom}:${periodTo}`,
    [countryId, currency, driverId, agentId, periodFrom, periodTo],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currency.trim()) qs.set("currency", currency.trim());
      if (driverId.trim()) qs.set("driverId", driverId.trim());
      if (agentId.trim()) qs.set("agentId", agentId.trim());
      if (periodFrom) qs.set("from", `${periodFrom}T00:00:00.000Z`);
      if (periodTo) qs.set("to", `${periodTo}T23:59:59.999Z`);
      const res = await apiFetch(`/api/finance/ledger?${qs}`, { signal });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!res.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      return (await res.json()) as ListResponse;
    },
    [
      apiFetch,
      countryId,
      currency,
      driverId,
      agentId,
      periodFrom,
      periodTo,
      finLocale,
    ],
  );

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    isEmpty: (payload) => payload.items.length === 0,
  });

  return (
    <AdminShell title={t("financialLedger")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/finance", label: t("finance") },
            { label: t("financialLedger") },
          ]}
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className={adminUi.sectionTitle}>{t("financialLedger")}</h1>
          <Link href="/finance" className={adminUi.link}>
            {t("finance")}
          </Link>
        </div>

        <FilterBar>
          <FilterField label={presentFinanceTerm("country", finLocale)}>
            <FinanceCountryFilterSelect
              value={countryId}
              onChange={setCountryId}
              locale={locale}
              allLabel={t("allCountries")}
              testId="ledger-country-filter"
              className={adminUi.filterControl}
            />
          </FilterField>
          <FilterField label={presentFinanceTerm("currency", finLocale)}>
            <input
              className={adminUi.filterControl}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              data-testid="ledger-currency-filter"
            />
          </FilterField>
          <FinancePartyNameFilter
            partyType="driver"
            value={driverId}
            onChange={setDriverId}
            countryId={countryId || undefined}
            testId="ledger-driver-filter"
          />
          <FinancePartyNameFilter
            partyType="agent"
            value={agentId}
            onChange={setAgentId}
            countryId={countryId || undefined}
            testId="ledger-agent-filter"
            disabled={!countryId}
          />
          <FilterField label={presentFinanceTerm("periodFrom", finLocale)}>
            <input
              type="date"
              className={adminUi.filterControl}
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              data-testid="ledger-from-filter"
            />
          </FilterField>
          <FilterField label={presentFinanceTerm("periodTo", finLocale)}>
            <input
              type="date"
              className={adminUi.filterControl}
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              data-testid="ledger-to-filter"
            />
          </FilterField>
          <button
            type="button"
            className={adminUi.btnSecondary}
            onClick={() => reload()}
            data-testid="ledger-reload"
          >
            {t("retry")}
          </button>
        </FilterBar>

        {data?.bounded ? (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            {presentFinanceTerm("boundedWindow", finLocale)}
          </p>
        ) : null}

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
        {state === "empty" ? (
          <EmptyState
            message={presentFinanceTerm("noMatchingRecords", finLocale)}
          />
        ) : null}

        {state === "success" && data && data.items.length > 0 ? (
          <AdminDataTable testId="financial-ledger-table">
            <AdminTableHead>
              <tr>
                <AdminTh>
                  {presentFinanceTerm("periodFrom", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("movementReference", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("movementDescription", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("direction", finLocale)}
                </AdminTh>
                <AdminTh>{presentFinanceTerm("amount", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("currency", finLocale)}</AdminTh>
                <AdminTh>
                  {presentFinanceTerm("movementActor", finLocale)}
                </AdminTh>
                <AdminTh>{presentFinanceTerm("party", finLocale)}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {data.items.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd>
                    {row.dateUtc ? (
                      <FormattedDateTime value={row.dateUtc} />
                    ) : (
                      "—"
                    )}
                  </AdminTd>
                  <AdminTd className={adminUi.monoId}>
                    <span dir="ltr">{row.reference}</span>
                  </AdminTd>
                  <AdminTd>{row.description}</AdminTd>
                  <AdminTd>
                    {directionLabel(row.direction, finLocale)}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(row.amountMinor, row.currency, finLocale)}
                  </AdminTd>
                  <AdminTd>
                    <span dir="ltr">{row.currency ?? "—"}</span>
                  </AdminTd>
                  <AdminTd>
                    <span dir="ltr">{row.actor ?? "—"}</span>
                  </AdminTd>
                  <AdminTd>
                    {row.driverId || row.agentId ? (
                      <span
                        className="font-mono text-xs text-slate-600"
                        dir="ltr"
                        title={row.driverId ?? row.agentId ?? undefined}
                      >
                        {row.driverId
                          ? `${presentFinanceTerm("driver", finLocale)} · ${
                              row.driverId.length > 10
                                ? `${row.driverId.slice(0, 8)}…`
                                : row.driverId
                            }`
                          : `${presentFinanceTerm("agent", finLocale)} · ${
                              (row.agentId ?? "").length > 10
                                ? `${(row.agentId ?? "").slice(0, 8)}…`
                                : row.agentId
                            }`}
                      </span>
                    ) : (
                      "—"
                    )}
                    {row.settlementId ? (
                      <div>
                        <Link
                          className={adminUi.link}
                          href={`/settlements/${row.settlementId}`}
                        >
                          <span
                            className="font-mono text-xs"
                            dir="ltr"
                            title={row.settlementId}
                          >
                            {row.settlementId.length > 14
                              ? `${row.settlementId.slice(0, 12)}…`
                              : row.settlementId}
                          </span>
                        </Link>
                      </div>
                    ) : null}
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
