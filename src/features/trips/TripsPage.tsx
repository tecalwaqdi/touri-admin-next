"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/states/QueryStates";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { DetailNavLink } from "@/components/ui/DetailNavLink";
import { CountryFilterSelect } from "@/components/ui/CountryFilterSelect";
import { CursorPaginationBar } from "@/components/ui/CursorPaginationBar";
import {
  CityCell,
  CountryCell,
  LandmarkCell,
} from "@/components/ui/GeoReferenceCells";
import { PrimaryWithTechnicalId } from "@/components/ui/PrimaryWithTechnicalId";
import { useI18n } from "@/i18n/I18nProvider";
import type { QueryState } from "@/types/common";
import { CANONICAL_TRIP_STATUSES } from "@/types/trip";
import type { TripListItem } from "@/application/production-read/listDtos";
import { useApiFetch } from "@/lib/apiClient";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
  type AdminDataSourceLabelView,
} from "@/domain/production-read/SourceLabel";
import { shortenId } from "@/domain/presentation/operationalDisplayName";
import { presentStatus, presentPaymentMethod, presentCancellationReason } from "@/domain/presentation/statusPresentation";
import { LtrIsolate } from "@/components/i18n/LtrIsolate";
import { FilterBar } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";

type TripRow = Partial<TripListItem> & {
  id: string;
  customerName?: string;
  driverName?: string | null;
  status?: string | null;
  countryId?: string | null;
  cityId?: string | null;
  paymentMethod?: string | null;
  currencyCode?: string | null;
  grossFare?: number | { amount: number | null } | null;
  customerDisplayName?: string | null;
  driverDisplayName?: string | null;
  customerDisplayRef?: string | null;
  driverDisplayRef?: string | null;
  customerIdKnowledge?: "known" | "missing" | "unknown";
  driverAssignment?: "assigned" | "never_assigned" | "broken_reference";
  pickupLandmarkName?: string | null;
  destinationLandmarkName?: string | null;
  pickupLandmarkKnowledge?: "known" | "missing" | "unknown";
  destinationLandmarkKnowledge?: "known" | "missing" | "unknown";
};

type TripsPayload = {
  items: TripRow[];
  nextCursor?: string | null;
  truncated?: boolean;
  pageSize?: number;
  searchScope?: string;
  label?: string;
  en?: string;
  ar?: string;
  synthetic?: boolean;
};

const PAGE_SIZE = 20;

function customerRef(trip: TripRow): string | null {
  return (
    trip.customerDisplayName ??
    trip.customerDisplayRef ??
    trip.customerName ??
    null
  );
}

function driverRef(trip: TripRow): string | null {
  return (
    trip.driverDisplayName ??
    trip.driverDisplayRef ??
    trip.driverName ??
    null
  );
}

function driverEmptyLabel(
  trip: TripRow,
  t: (k: "unavailable" | "neverAssigned" | "brokenReference") => string,
): string {
  if (trip.driverAssignment === "never_assigned" || !trip.driverId) {
    return t("neverAssigned");
  }
  if (trip.driverAssignment === "broken_reference") {
    return t("brokenReference");
  }
  return t("unavailable");
}

function grossAmount(trip: TripRow): number | null {
  if (trip.grossFare == null) return null;
  if (typeof trip.grossFare === "number") return trip.grossFare;
  return trip.grossFare.amount;
}

export function TripsPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<QueryState>("idle");
  const [data, setData] = useState<TripsPayload | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [status, setStatus] = useState("");
  const [countryId, setCountryId] = useState("");
  const [cityId, setCityId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [error, setError] = useState<string>();

  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const load = async () => {
    setState("loading");
    try {
      const params = new URLSearchParams({
        pageSize: String(PAGE_SIZE),
      });
      if (cursor) params.set("cursor", cursor);
      if (status) params.set("status", status);
      if (countryId) params.set("countryId", countryId);
      if (cityId.trim()) params.set("cityId", cityId.trim());
      if (paymentMethod) params.set("paymentMethod", paymentMethod);
      if (searchApplied) params.set("search", searchApplied);
      const res = await apiFetch(`/api/trips?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load trips");
      const json = (await res.json()) as TripsPayload;
      setData(json);
      setState(json.items.length === 0 ? "empty" : "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
      setState("error");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, status, countryId, cityId, paymentMethod, searchApplied]);

  const source: AdminDataSourceLabelView | null = data?.label
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

  const resetPaging = () => setCursorStack([null]);

  return (
    <AdminShell title={t("trips")}>
      <PermissionGuard permission="trips:read">
        <Breadcrumb items={[{ label: t("trips") }]} />
        <SourceLabelBadge source={source} />
        <FilterBar
          hint={
            searchApplied ? t("searchLoadedPageHint") : undefined
          }
        >
          <input
            data-testid="trips-search"
            className={adminUi.filterControl}
            placeholder={t("searchWithinLoaded")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            data-testid="trips-status-filter"
            className={adminUi.filterControl}
            value={status}
            onChange={(e) => {
              resetPaging();
              setStatus(e.target.value);
            }}
          >
            <option value="">{t("allStatuses")}</option>
            {CANONICAL_TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {presentStatus(s, locale)}
              </option>
            ))}
          </select>
          <CountryFilterSelect
            value={countryId}
            onChange={(id) => {
              resetPaging();
              setCountryId(id);
            }}
            locale={locale}
            allLabel={t("allCountries")}
            testId="trips-country-filter"
            className={adminUi.filterControl}
          />
          <input
            data-testid="trips-city-filter"
            className={adminUi.filterControl}
            aria-label={t("cityFilter")}
            placeholder={t("cityFilter")}
            value={cityId}
            onChange={(e) => {
              resetPaging();
              setCityId(e.target.value);
            }}
          />
          <select
            data-testid="trips-payment-filter"
            className={adminUi.filterControl}
            value={paymentMethod}
            onChange={(e) => {
              resetPaging();
              setPaymentMethod(e.target.value);
            }}
          >
            <option value="">
              {t("paymentMethod")} — {t("all")}
            </option>
            <option value="cash">{presentPaymentMethod("cash", locale)}</option>
            <option value="online">
              {presentPaymentMethod("online", locale)}
            </option>
            <option value="card">{presentPaymentMethod("card", locale)}</option>
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
            data-testid="trips-reset-filters"
            onClick={() => {
              resetPaging();
              setStatus("");
              setCountryId("");
              setCityId("");
              setPaymentMethod("");
              setSearch("");
              setSearchApplied("");
            }}
          >
            {t("resetFilters")}
          </button>
        </FilterBar>

        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <AdminDataTable
            testId="trips-table"
            footer={
              <CursorPaginationBar
                testIdPrefix="trips"
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
                <AdminTh>{t("id")}</AdminTh>
                <AdminTh>{t("status")}</AdminTh>
                <AdminTh>{t("customers")}</AdminTh>
                <AdminTh>{t("drivers")}</AdminTh>
                <AdminTh>{t("country")}</AdminTh>
                <AdminTh>{t("city")}</AdminTh>
                <AdminTh>{t("pickup")}</AdminTh>
                <AdminTh>{t("destination")}</AdminTh>
                <AdminTh>{t("paymentMethod")}</AdminTh>
                <AdminTh>{t("currency")}</AdminTh>
                <AdminTh>{t("grossFare")}</AdminTh>
                <AdminTh>{t("cancellation")}</AdminTh>
                <AdminTh className="sticky end-0 bg-slate-50">{t("details")}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {data.items.map((trip) => (
                <AdminTr key={trip.id}>
                  <AdminTd className={adminUi.monoId} title={trip.id}>
                    <LtrIsolate>{shortenId(trip.id, 12)}</LtrIsolate>
                  </AdminTd>
                  <AdminTd>
                    {trip.status ? (
                      <span data-testid={`trip-status-${trip.id}`}>
                        <StatusBadge value={trip.status} />
                      </span>
                    ) : (
                      <span data-testid={`trip-status-${trip.id}`} className="text-slate-500">
                        {t("unavailable")}
                      </span>
                    )}
                  </AdminTd>
                  <AdminTd className={adminUi.truncate}>
                    <PrimaryWithTechnicalId
                      primary={customerRef(trip)}
                      technicalId={trip.customerId}
                      emptyLabel={
                        trip.customerIdKnowledge === "missing" || !trip.customerId
                          ? t("missing")
                          : t("unavailable")
                      }
                    />
                  </AdminTd>
                  <AdminTd className={adminUi.truncate}>
                    <PrimaryWithTechnicalId
                      primary={driverRef(trip)}
                      technicalId={trip.driverId}
                      emptyLabel={driverEmptyLabel(trip, t)}
                    />
                  </AdminTd>
                  <AdminTd>
                    <CountryCell
                      canonicalCountryId={trip.canonicalCountryId}
                      countryId={trip.countryId}
                    />
                  </AdminTd>
                  <AdminTd>
                    <CityCell cityId={trip.cityId} />
                  </AdminTd>
                  <AdminTd>
                    <LandmarkCell
                      landmarkId={trip.pickupLandmarkId}
                      explicitName={trip.pickupLandmarkName}
                      knowledge={trip.pickupLandmarkKnowledge}
                    />
                  </AdminTd>
                  <AdminTd>
                    <LandmarkCell
                      landmarkId={trip.destinationLandmarkId}
                      explicitName={trip.destinationLandmarkName}
                      knowledge={trip.destinationLandmarkKnowledge}
                    />
                  </AdminTd>
                  <AdminTd>
                    {trip.paymentMethod
                      ? presentPaymentMethod(trip.paymentMethod, locale)
                      : t("unavailable")}
                  </AdminTd>
                  <AdminTd>
                    {trip.currencyCode ? (
                      <LtrIsolate>{trip.currencyCode}</LtrIsolate>
                    ) : (
                      t("unavailable")
                    )}
                  </AdminTd>
                  <AdminTd className="tabular-nums">
                    {grossAmount(trip) == null
                      ? t("unavailable")
                      : grossAmount(trip)}
                  </AdminTd>
                  <AdminTd className={adminUi.truncate}>
                    {trip.cancellation?.isCancelled
                      ? presentCancellationReason(
                          trip.cancellation.reason,
                          locale,
                        ) ?? presentStatus("cancelled", locale)
                      : "—"}
                  </AdminTd>
                  <AdminTd className="sticky end-0 bg-white">
                    <DetailNavLink
                      resource="trips"
                      href={`/trips/${trip.id}`}
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
