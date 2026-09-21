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
import type { AgentListItem } from "@/application/production-read/listDtos";
import type { CountryListItem } from "@/application/geography/CountriesReadService";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import { geographyCountryBucketKey } from "@/domain/geography/GeographyPresentation";
import { AgentCreatePanel } from "@/features/agents/AgentCreatePanel";

type AgentsPayload = {
  items: AgentListItem[];
  nextCursor?: string | null;
  truncated?: boolean;
  searchScope?: string;
  label?: string;
  en?: string;
  ar?: string;
  synthetic?: boolean;
};

const PAGE_SIZE = 20;

export function AgentsPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [countryId, setCountryId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);

  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const resetPaging = () => setCursorStack([null]);

  const queryKey = useMemo(
    () => `agents:${countryId}:${status}:${searchApplied}:${cursor}`,
    [countryId, status, searchApplied, cursor],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
      if (cursor) qs.set("cursor", cursor);
      if (countryId) qs.set("countryId", countryId);
      if (status) qs.set("status", status);
      if (searchApplied) qs.set("search", searchApplied);
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
      const invariantByBucket = Object.fromEntries(
        countries.map((c) => [
          geographyCountryBucketKey(c.countryId),
          c.invariant,
        ]),
      );
      return { agents, invariantByBucket };
    },
    [apiFetch, countryId, status, searchApplied, cursor],
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
        <p className="text-sm text-slate-600">{t("oneCountryOneAgent")}</p>
        <AgentCreatePanel onCreated={() => resetPaging()} />
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
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
            testId="agents-country-filter"
          />
          <select
            data-testid="agents-status-filter"
            className="rounded border px-3 py-2 text-sm"
            value={status}
            onChange={(e) => {
              resetPaging();
              setStatus(e.target.value);
            }}
          >
            <option value="">{t("status")}</option>
            <option value="active">{t("active")}</option>
            <option value="inactive">{t("inactive")}</option>
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
            data-testid="agents-table"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
          >
            <div className="overflow-x-auto">
              <table className="min-w-[44rem] w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-start">{t("profile")}</th>
                    <th className="px-3 py-3 text-start">{t("country")}</th>
                    <th className="px-3 py-3 text-start">{t("currency")}</th>
                    <th className="px-3 py-3 text-start">{t("status")}</th>
                    <th className="px-3 py-3 text-start">{t("invariantStatus")}</th>
                    <th className="px-3 py-3 text-start">{t("driversCount")}</th>
                    <th className="px-3 py-3 text-start">{t("tripsCount")}</th>
                    <th className="px-3 py-3 text-start">{t("details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.items.map((agent) => {
                    const bucket = geographyCountryBucketKey(
                      agent.canonicalCountryId ?? agent.countryId ?? "",
                    );
                    const invariant =
                      data.invariantByBucket[bucket] ?? "unknown";
                    return (
                      <tr key={agent.id} className="border-t border-slate-100">
                        <td className="px-3 py-3">
                          {agent.displayName ??
                            (agent as { name?: string }).name ??
                            t("unavailable")}
                          {(agent.dataQualityWarnings?.length ?? 0) > 0 ? (
                            <span
                              className="ms-2 text-xs text-amber-700"
                              title={agent.dataQualityWarnings
                                .map((w) =>
                                  locale === "ar" ? w.messageAr : w.messageEn,
                                )
                                .join("; ")}
                            >
                              ⚠
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div>
                            {agent.countryDisplayName ?? t("unavailable")}
                          </div>
                          <div className="font-mono text-xs text-slate-500">
                            {agent.canonicalCountryId ?? agent.countryId}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <UnavailableText
                            locale={locale}
                            value={agent.currencyHint}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge
                            value={
                              agent.status === "active" ? "active" : "inactive"
                            }
                          />
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge value={invariant} />
                        </td>
                        <td className="px-3 py-3">
                          <AggregateMetricCell
                            testId={`agent-drivers-count-${agent.id}`}
                            metric={agent.driversCount}
                            locale={locale}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <AggregateMetricCell
                            testId={`agent-trips-count-${agent.id}`}
                            metric={agent.tripsCount}
                            locale={locale}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <DetailNavLink
                            resource="agents"
                            href={`/agents/${agent.id}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <CursorPaginationBar
              testIdPrefix="agents"
              cursorStack={cursorStack}
              nextCursor={data.agents.nextCursor}
              truncated={data.agents.truncated}
              boundedHint={t("boundedResultsHint")}
              previousLabel={t("previous")}
              nextLabel={t("next")}
              onPrevious={() =>
                setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
              }
              onNext={() => {
                if (data.agents.nextCursor) {
                  setCursorStack((s) => [...s, data.agents.nextCursor!]);
                }
              }}
            />
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
