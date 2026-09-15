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
        <FilterBar
          hint={searchApplied ? t("searchLoadedPageHint") : undefined}
        >
          <input
            className={adminUi.filterControl}
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
            className={adminUi.filterControl}
          />
          <select
            data-testid="drivers-registration-filter"
            className={adminUi.filterControl}
            value={registrationStatus}
            onChange={(e) => {
              resetPaging();
              setRegistrationStatus(e.target.value);
            }}
          >
            <option value="">{t("registrationStatus")}</option>
            {REGISTRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {presentStatus(s, locale)}
              </option>
            ))}
          </select>
          <select
            data-testid="drivers-availability-filter"
            className={adminUi.filterControl}
            value={availabilityStatus}
            onChange={(e) => {
              resetPaging();
              setAvailabilityStatus(e.target.value);
            }}
          >
            <option value="">{t("availabilityStatus")}</option>
            <option value="available">
              {presentStatus("available", locale)}
            </option>
            <option value="busy">{presentStatus("busy", locale)}</option>
            <option value="unavailable">
              {presentStatus("unavailable", locale)}
            </option>
            <option value="online">{presentStatus("online", locale)}</option>
            <option value="offline">{presentStatus("offline", locale)}</option>
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
        </FilterBar>
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <AdminDataTable
            testId="drivers-table"
            footer={
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
            }
          >
            <AdminTableHead>
              <tr>
                <AdminTh>{t("overview")}</AdminTh>
                <AdminTh>{t("country")}</AdminTh>
                <AdminTh>{t("city")}</AdminTh>
                <AdminTh>{t("registrationStatus")}</AdminTh>
                <AdminTh>{t("approvalStatus")}</AdminTh>
                <AdminTh>{t("availabilityStatus")}</AdminTh>
                <AdminTh>{t("vehicle")}</AdminTh>
                <AdminTh>{t("documents")}</AdminTh>
                <AdminTh>{t("accountState")}</AdminTh>
                <AdminTh>{t("tripsCount")}</AdminTh>
                <AdminTh>{t("details")}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {data.items.map((driver) => (
                <AdminTr key={driver.id}>
                  <AdminTd
                    className={adminUi.truncate}
                    title={
                      driver.displayName ??
                      (driver as { name?: string }).name ??
                      undefined
                    }
                  >
                    {driver.displayName ??
                      (driver as { name?: string }).name ??
                      t("unavailable")}
                  </AdminTd>
                  <AdminTd>
                    {driver.canonicalCountryId ??
                      driver.countryId ??
                      t("unavailable")}
                  </AdminTd>
                  <AdminTd>
                    <UnavailableText locale={locale} value={driver.cityId} />
                  </AdminTd>
                  <AdminTd>
                    {driver.registrationStatus ? (
                      <StatusBadge value={driver.registrationStatus} />
                    ) : (
                      t("unavailable")
                    )}
                  </AdminTd>
                  <AdminTd>
                    {driver.approvalStatus ? (
                      <StatusBadge value={driver.approvalStatus} />
                    ) : (
                      t("unavailable")
                    )}
                  </AdminTd>
                  <AdminTd>
                    {driver.availabilityStatus ? (
                      <StatusBadge value={driver.availabilityStatus} />
                    ) : (
                      t("unavailable")
                    )}
                  </AdminTd>
                  <AdminTd className={adminUi.truncate}>
                    <UnavailableText
                      locale={locale}
                      value={driver.vehicleSummary}
                    />
                  </AdminTd>
                  <AdminTd>
                    {driver.documentCompleteness ? (
                      <StatusBadge value={driver.documentCompleteness} />
                    ) : (
                      t("unavailable")
                    )}
                  </AdminTd>
                  <AdminTd>
                    {driver.accountState ? (
                      <StatusBadge value={driver.accountState} />
                    ) : (
                      t("unavailable")
                    )}
                  </AdminTd>
                  <AdminTd>
                    <AggregateMetricCell
                      metric={driver.tripCount}
                      locale={locale}
                    />
                  </AdminTd>
                  <AdminTd>
                    <DetailNavLink
                      resource="drivers"
                      href={`/drivers/${driver.id}`}
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
