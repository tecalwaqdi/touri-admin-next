"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";
import type { PaginatedResult, QueryState } from "@/types/common";
import type { Trip } from "@/types/trip";
import { CANONICAL_TRIP_STATUSES } from "@/types/trip";
import { useApiFetch } from "@/lib/apiClient";

export function TripsPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<QueryState>("idle");
  const [data, setData] = useState<PaginatedResult<Trip> | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();

  const load = async () => {
    setState("loading");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "5",
      });
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      const res = await apiFetch(`/api/trips?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load trips");
      const json = (await res.json()) as PaginatedResult<Trip>;
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
  }, [page, status]);

  return (
    <AdminShell title={t("trips")}>
      <PermissionGuard permission="trips:read">
        <Breadcrumb items={[{ label: t("trips") }]} />
        <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <input
            data-testid="trips-search"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            data-testid="trips-status-filter"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
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
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => {
              setPage(1);
              void load();
            }}
          >
            {t("filters")}
          </button>
        </div>

        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <div data-testid="trips-table" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-start">
                <tr>
                  <th className="px-4 py-3 text-start">ID</th>
                  <th className="px-4 py-3 text-start">{t("customers")}</th>
                  <th className="px-4 py-3 text-start">{t("drivers")}</th>
                  <th className="px-4 py-3 text-start">{t("status")}</th>
                  <th className="px-4 py-3 text-start">{t("country")}</th>
                  <th className="px-4 py-3 text-start">{t("details")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((trip) => (
                  <tr key={trip.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{trip.id}</td>
                    <td className="px-4 py-3">{trip.customerName}</td>
                    <td className="px-4 py-3">{trip.driverName ?? "—"}</td>
                    <td className="px-4 py-3">{trip.status}</td>
                    <td className="px-4 py-3">{trip.countryId}</td>
                    <td className="px-4 py-3">
                      <Link className="text-emerald-700 underline" href={`/trips/${trip.id}`}>
                        {t("details")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                data-testid="trips-prev"
                disabled={page <= 1}
                className="rounded border px-3 py-1 disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("previous")}
              </button>
              <span data-testid="trips-page">
                {data.page} / {data.totalPages}
              </span>
              <button
                type="button"
                data-testid="trips-next"
                disabled={page >= data.totalPages}
                className="rounded border px-3 py-1 disabled:opacity-40"
                onClick={() => setPage((p) => p + 1)}
              >
                {t("next")}
              </button>
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
