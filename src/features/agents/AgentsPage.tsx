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
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import type { PaginatedResult } from "@/types/common";
import type { Agent } from "@/types/agent";
import type { CountryListItem } from "@/application/geography/CountriesReadService";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";

type AgentsPayload = PaginatedResult<Agent> & {
  label?: string;
  en?: string;
  ar?: string;
  synthetic?: boolean;
};

export function AgentsPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [countryId, setCountryId] = useState("");

  const queryKey = useMemo(() => `agents:${countryId}`, [countryId]);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams({ page: "1", pageSize: "50" });
      if (countryId) qs.set("countryId", countryId);
      const [agentsRes, countriesRes] = await Promise.all([
        apiFetch(`/api/agents?${qs}`, { signal }),
        apiFetch("/api/geography/countries", { signal }),
      ]);
      if (!agentsRes.ok) throw new Error("Failed to load agents");
      const agents = (await agentsRes.json()) as AgentsPayload;
      const countries = countriesRes.ok
        ? (((await countriesRes.json()) as { items: CountryListItem[] }).items ??
          [])
        : [];
      const invariantByCountry = Object.fromEntries(
        countries.map((c) => [c.countryId, c.invariant]),
      );
      return { agents, invariantByCountry };
    },
    [apiFetch, countryId],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    isEmpty: (d) => d.agents.items.length === 0,
  });

  const source = data?.agents?.label
    ? {
        label: normalizeSourceLabelCode(data.agents.label),
        code: normalizeSourceLabelCode(data.agents.label),
        en: data.agents.en ?? "",
        ar: data.agents.ar ?? "",
        synthetic: data.agents.synthetic === true,
      }
    : data
      ? resolveAdminDataSourceLabel({
          syntheticSource: data.agents.synthetic === true,
          productionFirestore: data.agents.synthetic === false,
        })
      : null;

  return (
    <AdminShell title={t("agents")}>
      <PermissionGuard permission="agents:read">
        <Breadcrumb items={[{ label: t("agents") }]} />
        <SourceLabelBadge source={source} />
        <p className="mb-3 text-sm text-slate-600">
          Policy: one country = one active agent.
        </p>
        <div className="mb-4">
          <label className="text-sm">
            {t("country")}
            <select
              className="mt-1 ms-2 rounded border px-2 py-1"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
            >
              <option value="">All</option>
              <option value="SA">SA</option>
              <option value="AE">AE</option>
              <option value="EG">EG</option>
              <option value="KW">KW</option>
              <option value="JO">JO</option>
            </select>
          </label>
        </div>
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <div
            data-testid="agents-table"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-start">Name</th>
                  <th className="px-4 py-3 text-start">{t("country")}</th>
                  <th className="px-4 py-3 text-start">{t("status")}</th>
                  <th className="px-4 py-3 text-start">Country invariant</th>
                  <th className="px-4 py-3 text-start">{t("driversCount")}</th>
                  <th className="px-4 py-3 text-start">{t("tripsCount")}</th>
                  <th className="px-4 py-3 text-start">{t("details")}</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.items.map((agent) => (
                  <tr key={agent.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{agent.name}</td>
                    <td className="px-4 py-3">{agent.countryId}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        value={agent.status === "active" ? "active" : "inactive"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        value={
                          data.invariantByCountry[agent.countryId] ?? "unknown"
                        }
                      />
                    </td>
                    <td className="px-4 py-3">{agent.driversCount}</td>
                    <td className="px-4 py-3">{agent.tripsCount}</td>
                    <td className="px-4 py-3">
                      <DetailNavLink
                        resource="agents"
                        href={`/agents/${agent.id}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
