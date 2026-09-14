"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import type { PaginatedResult } from "@/types/common";
import type { Driver } from "@/types/driver";

export function DriversPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const queryKey = useMemo(
    () => `drivers:${page}:${searchApplied}`,
    [page, searchApplied],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (searchApplied) qs.set("search", searchApplied);
      const res = await apiFetch(`/api/drivers?${qs}`, { signal });
      if (!res.ok) throw new Error("Failed to load drivers");
      return (await res.json()) as PaginatedResult<Driver>;
    },
    [apiFetch, page, searchApplied],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    isEmpty: (d) => d.items.length === 0,
  });

  return (
    <AdminShell title={t("drivers")}>
      <PermissionGuard permission="drivers:read">
        <Breadcrumb items={[{ label: t("drivers") }]} />
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => {
              setPage(1);
              setSearchApplied(search.trim());
            }}
          >
            {t("filters")}
          </button>
        </div>
        {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <div data-testid="drivers-table" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-start">Name</th>
                  <th className="px-4 py-3 text-start">{t("registrationStatus")}</th>
                  <th className="px-4 py-3 text-start">{t("approvalStatus")}</th>
                  <th className="px-4 py-3 text-start">{t("availabilityStatus")}</th>
                  <th className="px-4 py-3 text-start">{t("details")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((driver) => (
                  <tr key={driver.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{driver.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={driver.registrationStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={driver.approvalStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={driver.availabilityStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <Link className="text-emerald-700 underline" href={`/drivers/${driver.id}`}>
                        {t("details")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded border px-3 py-1 disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("previous")}
              </button>
              <span>
                {data.page} / {data.totalPages}
              </span>
              <button
                type="button"
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
