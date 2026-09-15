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
        <SourceLabelBadge source={source} />
        <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <input
            className="rounded border px-3 py-2 text-sm"
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
          />
          <select
            data-testid="customers-account-filter"
            className="rounded border px-3 py-2 text-sm"
            value={accountState}
            onChange={(e) => {
              resetPaging();
              setAccountState(e.target.value);
            }}
          >
            <option value="">{t("accountState")}</option>
            <option value="enabled">enabled</option>
            <option value="disabled">disabled</option>
            <option value="unknown">unknown</option>
          </select>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => {
              resetPaging();
              setSearchApplied(search.trim());
            }}
          >
            {t("filters")}
          </button>
          {searchApplied ? (
            <p className="w-full text-xs text-slate-500">{t("searchLoadedPageHint")}</p>
          ) : null}
        </div>
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <div
            data-testid="customers-table"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-start">{t("profile")}</th>
                    <th className="px-3 py-3 text-start">{t("email")}</th>
                    <th className="px-3 py-3 text-start">{t("country")}</th>
                    <th className="px-3 py-3 text-start">{t("city")}</th>
                    <th className="px-3 py-3 text-start">{t("status")}</th>
                    <th className="px-3 py-3 text-start">{t("createdAt")}</th>
                    <th className="px-3 py-3 text-start">{t("tripsCount")}</th>
                    <th className="px-3 py-3 text-start">{t("details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((customer) => (
                    <tr key={customer.id} className="border-t border-slate-100">
                      <td className="px-3 py-3">
                        {customer.displayName ??
                          (customer as { name?: string }).name ??
                          t("unavailable")}
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText
                          locale={locale}
                          value={customer.emailHint ?? customer.phoneHint}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {customer.canonicalCountryId ??
                          customer.countryId ??
                          t("unavailable")}
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText locale={locale} value={customer.cityId} />
                      </td>
                      <td className="px-3 py-3">
                        {customer.accountState ? (
                          <StatusBadge value={customer.accountState} />
                        ) : (
                          t("unavailable")
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText
                          locale={locale}
                          value={customer.createdAtUtc}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <AggregateMetricCell
                          testId={`customer-trip-count-${customer.id}`}
                          metric={customer.tripCount}
                          locale={locale}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <DetailNavLink
                          resource="customers"
                          href={`/customers/${customer.id}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
