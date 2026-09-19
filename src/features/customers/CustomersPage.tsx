"use client";

import { useCallback, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { DetailNavLink } from "@/components/ui/DetailNavLink";
import { CountryFilterSelect } from "@/components/ui/CountryFilterSelect";
import { CursorPaginationBar } from "@/components/ui/CursorPaginationBar";
import {
  AggregateMetricCell,
  UnavailableText,
} from "@/components/ui/AggregateMetricCell";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import type { CustomerListItem } from "@/application/production-read/listDtos";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import { FilterBar } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import { presentStatus } from "@/domain/presentation/statusPresentation";

type CustomersPayload = {
  items: CustomerListItem[];
  nextCursor?: string | null;
  truncated?: boolean;
  searchScope?: string;
  label?: string;
  en?: string;
  ar?: string;
  synthetic?: boolean;
};

const PAGE_SIZE = 20;

export function CustomersPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [countryId, setCountryId] = useState("");
  const [accountState, setAccountState] = useState("");
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const resetPaging = () => setCursorStack([null]);

  const queryKey = useMemo(
    () => `customers:${cursor}:${countryId}:${accountState}:${searchApplied}`,
    [cursor, countryId, accountState, searchApplied],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
      if (cursor) qs.set("cursor", cursor);
      if (countryId) qs.set("countryId", countryId);
      if (accountState) qs.set("accountState", accountState);
      if (searchApplied) qs.set("search", searchApplied);
      const res = await apiFetch(`/api/customers?${qs}`, { signal });
      if (!res.ok) throw new Error("Failed to load customers");
      return (await res.json()) as CustomersPayload;
    },
    [apiFetch, cursor, countryId, accountState, searchApplied],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    isEmpty: (d) => d.items.length === 0,
  });

  const source = data?.label
    ? {
        label: normalizeSourceLabelCode(data.label),
        code: normalizeSourceLabelCode(data.label),
        en: data.en ?? "",
        ar: data.ar ?? "",
        synthetic: data.synthetic === true,
      }
    : data
      ? resolveAdminDataSourceLabel({
          syntheticSource: data.synthetic === true,
          productionFirestore: data.synthetic === false,
        })
      : null;

  return (
    <AdminShell title={t("customers")}>
      <PermissionGuard permission="customers:read">
        <Breadcrumb items={[{ label: t("customers") }]} />
        <p className={adminUi.secondaryText}>{t("customerActionsHint")}</p>
        <SourceLabelBadge source={source} />
        <FilterBar
          testId="customers-filters"
          hint={searchApplied ? t("searchLoadedPageHint") : undefined}
        >
          <input
            data-testid="customers-search"
            className={adminUi.filterControl}
            aria-label={t("search")}
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <CountryFilterSelect
            value={countryId}
            onChange={(id) => {
              resetPaging();
              setCountryId(id);
            }}
            locale={locale}
            allLabel={t("allCountries")}
            testId="customers-country-filter"
            className={adminUi.filterControl}
          />
          <select
            data-testid="customers-account-filter"
            className={adminUi.filterControl}
            aria-label={t("accountState")}
            value={accountState}
            onChange={(e) => {
              resetPaging();
              setAccountState(e.target.value);
            }}
          >
            <option value="">{t("accountState")}</option>
            <option value="enabled">{presentStatus("enabled", locale)}</option>
            <option value="disabled">{presentStatus("disabled", locale)}</option>
            <option value="unknown">{presentStatus("unknown", locale)}</option>
          </select>
          <button
            type="button"
            className={adminUi.btnPrimary}
            onClick={() => {
              resetPaging();
              setSearchApplied(search.trim());
            }}
          >
            {t("filters")}
          </button>
          <button
            type="button"
            className={adminUi.btnGhost}
            data-testid="customers-reset-filters"
            onClick={() => {
              resetPaging();
              setCountryId("");
              setAccountState("");
              setSearch("");
              setSearchApplied("");
            }}
          >
            {t("resetFilters")}
          </button>
        </FilterBar>
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <AdminDataTable
            testId="customers-table"
            footer={
              <CursorPaginationBar
                testIdPrefix="customers"
                cursorStack={cursorStack}
                nextCursor={data.nextCursor}
                truncated={data.truncated}
                boundedHint={t("boundedResultsHint")}
                previousLabel={t("previous")}
                nextLabel={t("next")}
                onPrevious={() =>
                  setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
                }
                onNext={() => {
                  if (data.nextCursor) {
                    setCursorStack((s) => [...s, data.nextCursor!]);
                  }
                }}
              />
            }
          >
            <AdminTableHead>
              <tr>
                <AdminTh>{t("profile")}</AdminTh>
                <AdminTh>{t("email")}</AdminTh>
                <AdminTh>{t("country")}</AdminTh>
                <AdminTh>{t("city")}</AdminTh>
                <AdminTh>{t("accountState")}</AdminTh>
                <AdminTh>{t("createdAt")}</AdminTh>
                <AdminTh>{t("tripsCount")}</AdminTh>
                <AdminTh>{t("details")}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {data.items.map((customer) => (
                <AdminTr key={customer.id}>
                  <AdminTd>
                    {customer.displayName ??
                      (customer as { name?: string }).name ??
                      t("unavailable")}
                  </AdminTd>
                  <AdminTd>
                    <UnavailableText
                      locale={locale}
                      value={customer.emailHint ?? customer.phoneHint}
                    />
                  </AdminTd>
                  <AdminTd>
                    {customer.canonicalCountryId ??
                      customer.countryId ??
                      t("unavailable")}
                  </AdminTd>
                  <AdminTd>
                    <UnavailableText locale={locale} value={customer.cityId} />
                  </AdminTd>
                  <AdminTd>
                    {customer.accountState ? (
                      <StatusBadge value={customer.accountState} />
                    ) : (
                      t("unavailable")
                    )}
                  </AdminTd>
                  <AdminTd>
                    <UnavailableText
                      locale={locale}
                      value={customer.createdAtUtc}
                    />
                  </AdminTd>
                  <AdminTd>
                    <AggregateMetricCell
                      testId={`customer-trip-count-${customer.id}`}
                      metric={customer.tripCount}
                      locale={locale}
                    />
                  </AdminTd>
                  <AdminTd>
                    <DetailNavLink
                      resource="customers"
                      href={`/customers/${customer.id}`}
                    />
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
