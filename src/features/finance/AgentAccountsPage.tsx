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
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import type { AgentAccountListItem } from "@/domain/finance/reporting/AccountantAgentDirectory";

type ListResponse = { items: AgentAccountListItem[] };

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

export function AgentAccountsPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [countryId, setCountryId] = useState("");
  const [currency, setCurrency] = useState("");
  const [agentId, setAgentId] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () => `agent-accounts:${countryId}:${currency}:${agentId}`,
    [countryId, currency, agentId],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      qs.set("countryId", countryId);
      if (currency.trim()) qs.set("currency", currency.trim());
      if (agentId.trim()) qs.set("agentId", agentId.trim());
      const res = await apiFetch(`/api/finance/agent-accounts?${qs}`, {
        signal,
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!res.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      return (await res.json()) as ListResponse;
    },
    [apiFetch, countryId, currency, agentId, finLocale],
  );

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    enabled: Boolean(countryId),
    isEmpty: (payload) => payload.items.length === 0,
  });

  return (
    <AdminShell title={t("agentAccounts")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/finance", label: t("finance") },
            { label: t("agentAccounts") },
          ]}
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className={adminUi.sectionTitle}>{t("agentAccounts")}</h1>
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
              allLabel={presentFinanceTerm("country", finLocale)}
              allowEmpty
              testId="agent-accounts-country-filter"
              className={adminUi.filterControl}
            />
          </FilterField>
          <FilterField label={presentFinanceTerm("currency", finLocale)}>
            <input
              className={adminUi.filterControl}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              data-testid="agent-accounts-currency-filter"
            />
          </FilterField>
          <FilterField label={presentFinanceTerm("agentId", finLocale)}>
            <input
              className={adminUi.filterControl}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              data-testid="agent-accounts-agent-filter"
            />
          </FilterField>
          <button
            type="button"
            className={adminUi.btnSecondary}
            onClick={() => reload()}
            disabled={!countryId}
            data-testid="agent-accounts-reload"
          >
            {t("retry")}
          </button>
        </FilterBar>

        {!countryId ? (
          <EmptyState
            message={presentFinanceTerm("country", finLocale)}
          />
        ) : null}

        {countryId && (state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock rows={6} />
        ) : null}
        {forbidden ? (
          <ForbiddenState
            message={presentFinanceTerm("financeForbidden", finLocale)}
          />
        ) : null}
        {countryId && state === "error" && !forbidden ? (
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
        {countryId && state === "empty" ? (
          <EmptyState
            message={presentFinanceTerm("noMatchingRecords", finLocale)}
          />
        ) : null}

        {countryId && state === "success" && data && data.items.length > 0 ? (
          <AdminDataTable testId="agent-accounts-table">
            <AdminTableHead>
              <tr>
                <AdminTh>{presentFinanceTerm("agentId", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("country", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("currency", finLocale)}</AdminTh>
                <AdminTh>
                  {presentFinanceTerm("collectedCash", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("outstanding", finLocale)}
                </AdminTh>
                <AdminTh>{presentFinanceTerm("paid", finLocale)}</AdminTh>
                <AdminTh>
                  {presentFinanceTerm("settlementsDue", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("agentEntitlement", finLocale)}
                </AdminTh>
                <AdminTh>
                  {presentFinanceTerm("companyAmountDue", finLocale)}
                </AdminTh>
                <AdminTh>{presentFinanceTerm("status", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("details", finLocale)}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {data.items.map((row) => (
                <AdminTr key={`${row.agentId}:${row.countryId}`}>
                  <AdminTd className={adminUi.monoId}>
                    <span dir="ltr">{row.agentId}</span>
                  </AdminTd>
                  <AdminTd>
                    <span dir="ltr">{row.countryId}</span>
                  </AdminTd>
                  <AdminTd>
                    <span dir="ltr">{row.currency ?? "—"}</span>
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(
                      row.collectedCashMinor,
                      row.currency,
                      finLocale,
                    )}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(row.outstandingMinor, row.currency, finLocale)}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(row.paidMinor, row.currency, finLocale)}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(
                      row.settlementsDueMinor,
                      row.currency,
                      finLocale,
                    )}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(
                      row.agentEntitlementMinor,
                      row.currency,
                      finLocale,
                    )}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {moneyLabel(
                      row.companyAmountDueMinor,
                      row.currency,
                      finLocale,
                    )}
                  </AdminTd>
                  <AdminTd>
                    <StatusBadge value={row.attributionStatus} />
                  </AdminTd>
                  <AdminTd>
                    <Link
                      className={adminUi.link}
                      href={`/finance/agents/${encodeURIComponent(row.agentId)}?countryId=${encodeURIComponent(row.countryId)}`}
                    >
                      {presentFinanceTerm("details", finLocale)}
                    </Link>
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
