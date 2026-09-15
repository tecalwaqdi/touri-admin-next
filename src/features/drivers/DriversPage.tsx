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
import type { DriverListItem } from "@/application/production-read/listDtos";
import { REGISTRATION_STATUSES } from "@/types/driver";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";

type DriversPayload = {
  items: DriverListItem[];
  nextCursor?: string | null;
  truncated?: boolean;
  searchScope?: string;
  label?: string;
  en?: string;
  ar?: string;
  synthetic?: boolean;
};

const PAGE_SIZE = 20;

export function DriversPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [countryId, setCountryId] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState("");

  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const resetPaging = () => setCursorStack([null]);

  const queryKey = useMemo(
    () =>
      `drivers:${cursor}:${searchApplied}:${countryId}:${registrationStatus}:${availabilityStatus}`,
    [cursor, searchApplied, countryId, registrationStatus, availabilityStatus],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
      if (cursor) qs.set("cursor", cursor);
      if (searchApplied) qs.set("search", searchApplied);
      if (countryId) qs.set("countryId", countryId);
      if (registrationStatus) qs.set("registrationStatus", registrationStatus);
      if (availabilityStatus) qs.set("availabilityStatus", availabilityStatus);
      const res = await apiFetch(`/api/drivers?${qs}`, { signal });
      if (!res.ok) throw new Error("Failed to load drivers");
      return (await res.json()) as DriversPayload;
    },
    [
      apiFetch,
      cursor,
      searchApplied,
      countryId,
      registrationStatus,
      availabilityStatus,
    ],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
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
    <AdminShell title={t("drivers")}>
      <PermissionGuard permission="drivers:read">
        <Breadcrumb items={[{ label: t("drivers") }]} />
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
            testId="drivers-country-filter"
          />
          <select
            data-testid="drivers-registration-filter"
            className="rounded border px-3 py-2 text-sm"
            value={registrationStatus}
            onChange={(e) => {
              resetPaging();
              setRegistrationStatus(e.target.value);
            }}
          >
            <option value="">{t("registrationStatus")}</option>
            {REGISTRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            data-testid="drivers-availability-filter"
            className="rounded border px-3 py-2 text-sm"
            value={availabilityStatus}
            onChange={(e) => {
              resetPaging();
              setAvailabilityStatus(e.target.value);
            }}
          >
            <option value="">{t("availabilityStatus")}</option>
            <option value="available">available</option>
            <option value="busy">busy</option>
            <option value="unavailable">unavailable</option>
            <option value="online">online</option>
            <option value="offline">offline</option>
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
            data-testid="drivers-table"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-start">{t("overview")}</th>
                    <th className="px-3 py-3 text-start">{t("country")}</th>
                    <th className="px-3 py-3 text-start">{t("city")}</th>
                    <th className="px-3 py-3 text-start">{t("registrationStatus")}</th>
                    <th className="px-3 py-3 text-start">{t("approvalStatus")}</th>
                    <th className="px-3 py-3 text-start">{t("availabilityStatus")}</th>
                    <th className="px-3 py-3 text-start">{t("vehicle")}</th>
                    <th className="px-3 py-3 text-start">{t("documents")}</th>
                    <th className="px-3 py-3 text-start">{t("accountState")}</th>
                    <th className="px-3 py-3 text-start">{t("tripsCount")}</th>
                    <th className="px-3 py-3 text-start">{t("details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((driver) => (
                    <tr key={driver.id} className="border-t border-slate-100">
                      <td className="px-3 py-3">{driver.displayName ?? (driver as { name?: string }).name ?? t("unavailable")}</td>
                      <td className="px-3 py-3">
                        {driver.canonicalCountryId ??
                          driver.countryId ??
                          t("unavailable")}
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText locale={locale} value={driver.cityId} />
                      </td>
                      <td className="px-3 py-3">
                        {driver.registrationStatus ? (
                          <StatusBadge value={driver.registrationStatus} />
                        ) : (
                          t("unavailable")
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {driver.approvalStatus ? (
                          <StatusBadge value={driver.approvalStatus} />
                        ) : (
                          t("unavailable")
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {driver.availabilityStatus ? (
                          <StatusBadge value={driver.availabilityStatus} />
                        ) : (
                          t("unavailable")
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText
                          locale={locale}
                          value={driver.vehicleSummary}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {driver.documentCompleteness ? (
                          <StatusBadge value={driver.documentCompleteness} />
                        ) : (
                          t("unavailable")
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {driver.accountState ? (
                          <StatusBadge value={driver.accountState} />
                        ) : (
                          t("unavailable")
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <AggregateMetricCell
                          metric={driver.tripCount}
                          locale={locale}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <DetailNavLink
                          resource="drivers"
                          href={`/drivers/${driver.id}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CursorPaginationBar
              testIdPrefix="drivers"
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
