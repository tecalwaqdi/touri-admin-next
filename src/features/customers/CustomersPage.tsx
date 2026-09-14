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
import type { Customer, PaginatedResult } from "@/types/common";

export function CustomersPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [page, setPage] = useState(1);

  const queryKey = useMemo(() => `customers:${page}`, [page]);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch(`/api/customers?page=${page}&pageSize=20`, {
        signal,
      });
      if (!res.ok) throw new Error("Failed to load customers");
      return (await res.json()) as PaginatedResult<Customer>;
    },
    [apiFetch, page],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    isEmpty: (d) => d.items.length === 0,
  });

  return (
    <AdminShell title={t("customers")}>
      <PermissionGuard permission="customers:read">
        <Breadcrumb items={[{ label: t("customers") }]} />
        {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <div
            data-testid="customers-table"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-start">Name</th>
                  <th className="px-4 py-3 text-start">{t("country")}</th>
                  <th className="px-4 py-3 text-start">{t("status")}</th>
                  <th className="px-4 py-3 text-start">{t("tripsCount")}</th>
                  <th className="px-4 py-3 text-start">{t("details")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((customer) => (
                  <tr key={customer.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{customer.name}</td>
                    <td className="px-4 py-3">{customer.countryId}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={customer.status} />
                    </td>
                    <td className="px-4 py-3">{customer.tripCount}</td>
                    <td className="px-4 py-3">
                      <Link
                        className="text-emerald-700 underline"
                        href={`/customers/${customer.id}`}
                      >
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
