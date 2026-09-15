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
import { UnavailableText } from "@/components/ui/AggregateMetricCell";
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

/** Production list item or legacy synthetic trip row. */
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
  return trip.customerDisplayRef ?? trip.customerName ?? shortenId(trip.customerId) ?? null;
}

function driverRef(trip: TripRow): string | null {
  return trip.driverDisplayRef ?? trip.driverName ?? shortenId(trip.driverId) ?? null;
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
  }, [cursor, status, countryId, paymentMethod, searchApplied]);

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
        <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <input
            data-testid="trips-search"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder={`${t("search")} (ID)`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            data-testid="trips-status-filter"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => {
              resetPaging();
              setStatus(e.target.value);
            }}
          >
            <option value="">{t("status")}</option>
            {CANONICAL_TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
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
          />
          <select
            data-testid="trips-payment-filter"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            value={paymentMethod}
            onChange={(e) => {
              resetPaging();
              setPaymentMethod(e.target.value);
            }}
          >
            <option value="">{t("paymentMethod")}</option>
            <option value="cash">cash</option>
            <option value="online">online</option>
            <option value="card">card</option>
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

        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <div
            data-testid="trips-table"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-start">
                  <tr>
                    <th className="px-3 py-3 text-start">ID</th>
                    <th className="px-3 py-3 text-start">{t("status")}</th>
                    <th className="px-3 py-3 text-start">{t("customers")}</th>
                    <th className="px-3 py-3 text-start">{t("drivers")}</th>
                    <th className="px-3 py-3 text-start">{t("country")}</th>
                    <th className="px-3 py-3 text-start">{t("city")}</th>
                    <th className="px-3 py-3 text-start">{t("pickup")}</th>
                    <th className="px-3 py-3 text-start">{t("destination")}</th>
                    <th className="px-3 py-3 text-start">{t("paymentMethod")}</th>
                    <th className="px-3 py-3 text-start">{t("currency")}</th>
                    <th className="px-3 py-3 text-start">{t("grossFare")}</th>
                    <th className="px-3 py-3 text-start">{t("cancellation")}</th>
                    <th className="px-3 py-3 text-start">{t("details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((trip) => (
                    <tr key={trip.id} className="border-t border-slate-100">
                      <td className="px-3 py-3 font-mono text-xs" title={trip.id}>
                        {shortenId(trip.id, 12)}
                      </td>
                      <td className="px-3 py-3">
                        {trip.status ? (
                          <StatusBadge value={trip.status} />
                        ) : (
                          t("unavailable")
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText locale={locale} value={customerRef(trip)} />
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText locale={locale} value={driverRef(trip)} />
                      </td>
                      <td className="px-3 py-3">
                        {trip.canonicalCountryId ??
                          trip.countryId ??
                          t("unavailable")}
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText locale={locale} value={trip.cityId} />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        <UnavailableText
                          locale={locale}
                          value={shortenId(trip.pickupLandmarkId)}
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        <UnavailableText
                          locale={locale}
                          value={shortenId(trip.destinationLandmarkId)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText
                          locale={locale}
                          value={trip.paymentMethod}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <UnavailableText
                          locale={locale}
                          value={trip.currencyCode}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {grossAmount(trip) == null
                          ? t("unavailable")
                          : grossAmount(trip)}
                      </td>
                      <td className="px-3 py-3">
                        {trip.cancellation?.isCancelled
                          ? trip.cancellation.reason ?? "cancelled"
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <DetailNavLink
                          resource="trips"
                          href={`/trips/${trip.id}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
