"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ForbiddenState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { FinanceCountryFilterSelect } from "@/components/ui/FinanceCountryFilterSelect";
import { FinancePartyNameFilter } from "@/components/ui/FinancePartyNameFilter";
import { AccountantPageHeader } from "@/components/ui/accountant/AccountantPageHeader";
import { ClassificationBadge } from "@/components/ui/accountant/ClassificationBadge";
import { DataClassificationFilter } from "@/components/ui/accountant/DataClassificationFilter";
import { AccountantDatePresetSelect } from "@/components/ui/accountant/AccountantDatePresetSelect";
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
import { presentStatus } from "@/domain/presentation/statusPresentation";
import { resolveCountryDisplayName } from "@/domain/geography/GeographyPresentation";
import type { AccountantDataClass } from "@/domain/finance/reporting/AccountantDataClassification";
import type {
  GlobalExplorerRecordType,
  GlobalFinancialExplorerRow,
} from "@/domain/finance/reporting/AccountantGlobalFinancialExplorer";
import type { AccountantDatePreset } from "@/domain/ui/accountantDatePresets";

type ExplorerResponse = {
  items: GlobalFinancialExplorerRow[];
  total: number;
  byClass: Record<AccountantDataClass, number>;
  officialTotalsIsolated: true;
};

function moneyLabel(
  amountMinor: string | null,
  currency: string | null,
  locale: FinanceLocale,
): string {
  if (amountMinor == null || !currency) {
    return presentMoneyAvailability("missing", locale);
  }
  return formatMinorUnitsDisplay(amountMinor, currency);
}

function detailHref(row: GlobalFinancialExplorerRow): string | null {
  if (row.recordType === "settlement") {
    return `/settlements/${encodeURIComponent(row.id)}`;
  }
  if (row.relatedSettlementId) {
    return `/settlements/${encodeURIComponent(row.relatedSettlementId)}`;
  }
  if (row.partyType === "driver" && row.partyId) {
    return `/finance/driver-wallets?driverId=${encodeURIComponent(row.partyId)}`;
  }
  if (row.partyType === "agent" && row.partyId && row.countryId) {
    return `/finance/agents/${encodeURIComponent(row.partyId)}?countryId=${encodeURIComponent(row.countryId)}`;
  }
  return null;
}

export function GlobalFinancialExplorerPage() {
  const { t, locale } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [countryId, setCountryId] = useState("");
  const [currency, setCurrency] = useState("");
  const [driverId, setDriverId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [datePreset, setDatePreset] = useState<AccountantDatePreset>("custom");
  const [dataClass, setDataClass] = useState<AccountantDataClass | "">("");
  const [recordType, setRecordType] = useState<GlobalExplorerRecordType | "">("");
  const [forbidden, setForbidden] = useState(false);

  const queryKey = useMemo(
    () =>
      `finance-explorer:${countryId}:${currency}:${driverId}:${agentId}:${periodFrom}:${periodTo}:${dataClass}:${recordType}`,
    [
      countryId,
      currency,
      driverId,
      agentId,
      periodFrom,
      periodTo,
      dataClass,
      recordType,
    ],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      setForbidden(false);
      const qs = new URLSearchParams();
      if (countryId) qs.set("countryId", countryId);
      if (currency) qs.set("currency", currency);
      if (driverId) qs.set("driverId", driverId);
      if (agentId) qs.set("agentId", agentId);
      if (periodFrom) qs.set("periodFromUtc", `${periodFrom}T00:00:00.000Z`);
      if (periodTo) qs.set("periodToUtc", `${periodTo}T23:59:59.999Z`);
      if (dataClass) qs.set("dataClass", dataClass);
      if (recordType) qs.set("recordType", recordType);
      qs.set("includePilotRecords", "1");
      qs.set("limit", "200");
      const res = await apiFetch(`/api/finance/explorer?${qs}`, { signal });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        throw new Error(presentFinanceTerm("financeForbidden", finLocale));
      }
      if (!res.ok) {
        throw new Error(presentFinanceTerm("dataUnavailable", finLocale));
      }
      return (await res.json()) as ExplorerResponse;
    },
    [
      apiFetch,
      countryId,
      currency,
      driverId,
      agentId,
      periodFrom,
      periodTo,
      dataClass,
      recordType,
      finLocale,
    ],
  );

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
  });

  return (
    <PermissionGuard permission="finance:read">
      <AdminShell title={t("globalFinancialExplorer")} hideTitle>
        <AccountantPageHeader
          title={presentFinanceTerm("globalFinancialExplorer", finLocale)}
          subtitle={presentFinanceTerm("globalExplorerHint", finLocale)}
          breadcrumbs={[
            { href: "/finance", label: presentFinanceTerm("financeHome", finLocale) },
            { label: presentFinanceTerm("globalFinancialExplorer", finLocale) },
          ]}
          actions={
            <Link href="/finance" className={adminUi.btnSecondary}>
              {presentFinanceTerm("certifiedTotals", finLocale)}
            </Link>
          }
        />

        <p
          className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950"
          data-testid="explorer-totals-isolated"
        >
          {presentFinanceTerm("officialTotalsIsolatedHint", finLocale)}
        </p>

        <FilterBar>
          <AccountantDatePresetSelect
            locale={finLocale}
            value={datePreset}
            onChange={(preset, range) => {
              setDatePreset(preset);
              if (range) {
                setPeriodFrom(range.from);
                setPeriodTo(range.to);
              }
            }}
          />
          {datePreset === "custom" ? (
            <>
              <FilterField label={presentFinanceTerm("periodFrom", finLocale)}>
                <input
                  type="date"
                  className={adminUi.filterControl}
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                />
              </FilterField>
              <FilterField label={presentFinanceTerm("periodTo", finLocale)}>
                <input
                  type="date"
                  className={adminUi.filterControl}
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </FilterField>
            </>
          ) : null}
          <FilterField label={presentFinanceTerm("country", finLocale)}>
            <FinanceCountryFilterSelect
              value={countryId}
              onChange={setCountryId}
              locale={locale}
              allLabel={t("allCountries")}
              allowEmpty
              className={adminUi.filterControl}
            />
          </FilterField>
          <FilterField label={presentFinanceTerm("currency", finLocale)}>
            <input
              className={adminUi.filterControl}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="SAR"
            />
          </FilterField>
          <FinancePartyNameFilter
            partyType="driver"
            value={driverId}
            onChange={setDriverId}
            countryId={countryId || undefined}
          />
          <FinancePartyNameFilter
            partyType="agent"
            value={agentId}
            onChange={setAgentId}
            countryId={countryId || undefined}
          />
          <DataClassificationFilter
            locale={finLocale}
            value={dataClass}
            onChange={setDataClass}
          />
          <FilterField label={presentFinanceTerm("recordType", finLocale)}>
            <select
              data-testid="explorer-record-type"
              className={adminUi.filterControl}
              value={recordType}
              onChange={(e) =>
                setRecordType(e.target.value as GlobalExplorerRecordType | "")
              }
            >
              <option value="">{presentFinanceTerm("all", finLocale)}</option>
              <option value="snapshot">
                {presentFinanceTerm("explorerSnapshot", finLocale)}
              </option>
              <option value="settlement">
                {presentFinanceTerm("explorerSettlement", finLocale)}
              </option>
              <option value="payment">
                {presentFinanceTerm("explorerPayment", finLocale)}
              </option>
              <option value="adjustment">
                {presentFinanceTerm("explorerAdjustment", finLocale)}
              </option>
            </select>
          </FilterField>
        </FilterBar>

        {forbidden ? (
          <ForbiddenState message={presentFinanceTerm("financeForbidden", finLocale)} />
        ) : state === "loading" && !data ? (
          <SkeletonBlock />
        ) : state === "error" ? (
          <>
            <UnavailableState
              message={error ?? presentFinanceTerm("dataUnavailable", finLocale)}
            />
            <button
              type="button"
              className={`${adminUi.btnSecondary} mt-3`}
              onClick={reload}
            >
              {presentFinanceTerm("refresh", finLocale)}
            </button>
          </>
        ) : !data || data.items.length === 0 ? (
          <EmptyState message={presentFinanceTerm("noMatchingRecords", finLocale)} />
        ) : (
          <>
            {data.byClass ? (
              <div
                className="mb-3 flex flex-wrap gap-2 text-xs"
                data-testid="explorer-class-counts"
              >
                {(Object.entries(data.byClass) as Array<[AccountantDataClass, number]>)
                  .filter(([, n]) => n > 0)
                  .map(([c, n]) => (
                    <span key={c} className="inline-flex items-center gap-1">
                      <ClassificationBadge dataClass={c} locale={finLocale} />
                      <span className="tabular-nums text-slate-600">{n}</span>
                    </span>
                  ))}
              </div>
            ) : null}
            <AdminDataTable testId="global-financial-explorer-table">
              <AdminTableHead>
                <AdminTh>{presentFinanceTerm("createdAt", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("movementDescription", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("dataClassification", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("country", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("status", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("value", finLocale)}</AdminTh>
                <AdminTh>{presentFinanceTerm("details", finLocale)}</AdminTh>
              </AdminTableHead>
              <tbody>
                {data.items.map((row) => {
                  const href = detailHref(row);
                  return (
                    <AdminTr key={`${row.recordType}:${row.id}`}>
                      <AdminTd>
                        {row.occurredAtUtc ? (
                          <FormattedDateTime value={row.occurredAtUtc} />
                        ) : (
                          presentMoneyAvailability("missing", finLocale)
                        )}
                      </AdminTd>
                      <AdminTd>
                        <div className="font-medium">
                          {presentFinanceTerm(row.descriptionKey, finLocale)}
                        </div>
                        <div className="truncate text-xs text-slate-500" title={row.id}>
                          {row.id.length > 16 ? `${row.id.slice(0, 8)}…` : row.id}
                        </div>
                      </AdminTd>
                      <AdminTd>
                        <ClassificationBadge
                          dataClass={row.dataClass}
                          locale={finLocale}
                        />
                      </AdminTd>
                      <AdminTd>
                        {row.countryId
                          ? resolveCountryDisplayName({
                              countryId: row.countryId,
                              locale: finLocale,
                            }) ?? row.countryId
                          : "—"}
                      </AdminTd>
                      <AdminTd>
                        {row.status
                          ? presentStatus(row.status, finLocale)
                          : "—"}
                      </AdminTd>
                      <AdminTd className="tabular-nums">
                        {moneyLabel(row.amountMinor, row.currency, finLocale)}
                      </AdminTd>
                      <AdminTd>
                        {href ? (
                          <Link href={href} className={adminUi.link}>
                            {presentFinanceTerm("details", finLocale)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </AdminTd>
                    </AdminTr>
                  );
                })}
              </tbody>
            </AdminDataTable>
          </>
        )}
      </AdminShell>
    </PermissionGuard>
  );
}
