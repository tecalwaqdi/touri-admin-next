"use client";

import Link from "next/link";
import { useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import type { CountryListItem } from "@/application/geography/CountriesReadService";

export function GeographyPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();

  const fetcher = useCallback(async (signal: AbortSignal) => {
    const res = await apiFetch("/api/geography/countries", { signal });
    if (!res.ok) throw new Error("Failed to load countries");
    const json = (await res.json()) as { items: CountryListItem[] };
    return json.items;
  }, [apiFetch]);

  const { state, data, error, reload } = useStableQuery({
    queryKey: "countries-list",
    fetcher,
    isEmpty: (items) => items.length === 0,
  });

  return (
    <AdminShell title={t("geography")}>
      <Breadcrumb items={[{ label: t("geography") }]} />
      <p className="mb-4 text-sm text-slate-600">
        One country = one active agent. Invariant enforced in domain; surfaced here for ops.
      </p>
      {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
      {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
      {state === "empty" ? <EmptyState /> : null}
      {state === "success" && data ? (
        <div
          data-testid="countries-table"
          className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-start">{t("country")}</th>
                <th className="px-4 py-3 text-start">Active agent</th>
                <th className="px-4 py-3 text-start">Currency</th>
                <th className="px-4 py-3 text-start">Invariant</th>
                <th className="px-4 py-3 text-start">Inactive agents</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.countryId} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{row.countryId}</td>
                  <td className="px-4 py-3">
                    {row.activeAgentId ? (
                      <Link
                        className="text-emerald-700 underline"
                        href={`/agents/${row.activeAgentId}`}
                      >
                        {row.activeAgentName ?? row.activeAgentId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{row.currencyHint ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={row.invariant}
                      testId={`country-invariant-${row.countryId}`}
                    />
                  </td>
                  <td className="px-4 py-3">{row.inactiveAgentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminShell>
  );
}
