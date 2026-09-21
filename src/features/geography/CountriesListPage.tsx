"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  EmptyState,
  ErrorState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { GeographyDqBadge } from "@/components/ui/GeographyDqBadge";
import { CursorPaginationBar } from "@/components/ui/CursorPaginationBar";
import { AggregateMetricCell, UnavailableText } from "@/components/ui/AggregateMetricCell";
import { useI18n } from "@/i18n/I18nProvider";
import { presentStatus } from "@/domain/presentation/statusPresentation";
import { presentGeographyDqSeverity } from "@/domain/geography/GeographyDataQuality";
import { useApiFetch } from "@/lib/apiClient";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { CountryListItem } from "@/application/geography/CountriesReadService";
import { GeographyCreatePanel } from "@/features/geography/GeographyCreatePanel";
import {
  GeographyGateNotice,
  GeographyHierarchyHints,
  GeographySubNav,
} from "@/features/geography/GeographyChrome";

const PAGE_SIZE = 20;

const NON_DEFAULT_RECORD_CLASSES = new Set([
  "qa",
  "production_pilot",
  "legacy",
]);

function isTestOrQaGeographyRow(row: {
  testOrNoncanonical?: boolean;
  recordClass?: string | null;
}): boolean {
  if (row.testOrNoncanonical === true) return true;
  return row.recordClass != null && NON_DEFAULT_RECORD_CLASSES.has(row.recordClass);
}

type SourcePayload = {
  label?: string;
  en?: string;
  ar?: string;
  synthetic?: boolean;
};

function useSource(data: SourcePayload | null) {
  if (!data) return null;
  if (data.label) {
    return {
      label: normalizeSourceLabelCode(data.label),
      code: normalizeSourceLabelCode(data.label),
      en: data.en ?? "",
      ar: data.ar ?? "",
      synthetic: data.synthetic === true,
    };
  }
  return resolveAdminDataSourceLabel({
    syntheticSource: data.synthetic === true,
    productionFirestore: data.synthetic === false,
  });
}

export function CountriesListPage() {
  const { locale, t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"idle" | "loading" | "error" | "empty" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<(SourcePayload & {
    items: CountryListItem[];
    nextCursor?: string | null;
    truncated?: boolean;
  }) | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [agentInvariant, setAgentInvariant] = useState("");
  const [dqSeverity, setDqSeverity] = useState("");
  const hideTestQa = true;
  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      if (cursor) qs.set("cursor", cursor);
      if (agentInvariant) qs.set("agentInvariant", agentInvariant);
      if (dqSeverity) qs.set("dqSeverity", dqSeverity);
      const res = await apiFetch(`/api/geography/countries?${qs}`);
      if (!res.ok) throw new Error("Failed to load countries");
      const json = (await res.json()) as {
        items: CountryListItem[];
        nextCursor?: string | null;
        truncated?: boolean;
      } & SourcePayload;
      setData(json);
      setState(json.items.length === 0 ? "empty" : "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch, cursor, agentInvariant, dqSeverity]);

  useEffect(() => {
    void load();
  }, [load]);

  const source = useSource(data);
  const visibleItems =
    data?.items.filter((row) => !(hideTestQa && isTestOrQaGeographyRow(row))) ??
    [];

  return (
    <AdminShell title={t("countries")}>
      <Breadcrumb
        items={[
          { label: t("geography"), href: "/geography" },
          { label: t("countries") },
        ]}
      />
      <GeographyHierarchyHints includeAgentHint />
      <GeographyGateNotice />
      <GeographySubNav />
      <SourceLabelBadge source={source} />
      <GeographyCreatePanel resource="country" onCreated={() => void load()} />
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          data-testid="country-agent-invariant-filter"
          className="rounded border px-2 py-1 text-sm"
          value={agentInvariant}
          onChange={(e) => {
            setCursorStack([null]);
            setAgentInvariant(e.target.value);
          }}
        >
          <option value="">{t("allAgentStates")}</option>
          <option value="PASS">{presentStatus("PASS", locale)}</option>
          <option value="NO_ACTIVE_AGENT">{presentStatus("NO_ACTIVE_AGENT", locale)}</option>
          <option value="VIOLATION">{presentStatus("VIOLATION", locale)}</option>
          <option value="DATA_QUALITY_WARNING">{presentStatus("DATA_QUALITY_WARNING", locale)}</option>
        </select>
        <select
          data-testid="country-dq-filter"
          className="rounded border px-2 py-1 text-sm"
          value={dqSeverity}
          onChange={(e) => {
            setCursorStack([null]);
            setDqSeverity(e.target.value);
          }}
        >
          <option value="">{t("allDqSeverities")}</option>
          <option value="INFO">{presentGeographyDqSeverity("INFO", locale === "ar" ? "ar" : "en")}</option>
          <option value="WARNING">{presentGeographyDqSeverity("WARNING", locale === "ar" ? "ar" : "en")}</option>
          <option value="ERROR">{presentGeographyDqSeverity("ERROR", locale === "ar" ? "ar" : "en")}</option>
          <option value="INVARIANT_VIOLATION">{presentGeographyDqSeverity("INVARIANT_VIOLATION", locale === "ar" ? "ar" : "en")}</option>
        </select>
      </div>
      {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
      {state === "error" ? <ErrorState message={error ?? undefined} onRetry={() => void load()} /> : null}
      {state === "empty" || (data && visibleItems.length === 0 && data.items.length > 0) ? (
        <EmptyState
          message={
            data && data.items.length > 0 && visibleItems.length === 0
              ? t("hideTestQaRecords")
              : undefined
          }
        />
      ) : null}
      {data && visibleItems.length > 0 ? (
        <div
          data-testid="countries-table"
          className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-start">{t("country")}</th>
                <th className="px-4 py-3 text-start">{t("isoCode")}</th>
                <th className="px-4 py-3 text-start">{t("currency")}</th>
                <th className="px-4 py-3 text-start">{t("activeAgent")}</th>
                <th className="px-4 py-3 text-start">{t("invariant")}</th>
                <th className="px-4 py-3 text-start">{t("cities")}</th>
                <th className="px-4 py-3 text-start">{t("landmarks")}</th>
                <th className="px-4 py-3 text-start">{t("dataQuality")}</th>
                <th className="px-4 py-3 text-start">{t("details")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((row) => {
                const issueCount =
                  (row.dataQualityIssues?.length ?? 0) ||
                  (row.dataQualityWarnings?.length ?? 0);
                const issueTitle =
                  locale === "ar"
                    ? (row.dataQualityWarnings ?? [])
                        .map((w) => w.messageAr)
                        .join(" · ")
                    : (row.dataQualityWarnings ?? [])
                        .map((w) => w.messageEn)
                        .join(" · ");
                return (
                <tr key={row.countryId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {locale === "ar"
                        ? row.displayNameAr ?? row.displayName ?? "—"
                        : row.displayNameEn ?? row.displayName ?? "—"}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {row.canonicalCountryId ?? row.countryId}
                    </div>
                    {isTestOrQaGeographyRow(row) ? (
                      <span
                        data-testid={`country-test-badge-${row.countryId}`}
                        className="mt-1 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
                      >
                        {t("testOrQaRecord")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{(row as { iso2?: string | null }).iso2 ?? "—"}</td>
                  <td className="px-4 py-3">
                    {row.currencyCode ?? row.currencyHint ?? (
                      <UnavailableText locale={locale} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.activeAgentId ? (
                      <Link
                        className="text-slate-900 underline"
                        href={`/agents/${row.activeAgentId}`}
                      >
                        {row.activeAgentName ?? row.activeAgentId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={row.agentInvariantState ?? row.invariant}
                      testId={`country-invariant-${row.countryId}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AggregateMetricCell
                      metric={row.citiesCount}
                      locale={locale}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <AggregateMetricCell
                      metric={row.landmarksCount}
                      locale={locale}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="flex flex-col gap-1"
                      title={issueTitle || undefined}
                    >
                      <GeographyDqBadge severity={row.dqSeverity ?? null} />
                      {issueCount > 0 ? (
                        <span
                          data-testid={`country-dq-count-${row.countryId}`}
                          className="text-xs text-slate-500"
                        >
                          {t("dqIssueCount").replace(
                            "{count}",
                            String(issueCount),
                          )}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      data-testid={`country-detail-${row.countryId}`}
                      className="underline"
                      href={`/geography/countries/${encodeURIComponent(row.countryId)}`}
                    >
                      {t("details")}
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <CursorPaginationBar
            cursorStack={cursorStack}
            nextCursor={data.nextCursor}
            truncated={data.truncated}
            boundedHint={t("boundedSampleHint")}
            previousLabel={t("previous")}
            nextLabel={t("next")}
            onPrevious={() => setCursorStack((s) => s.slice(0, -1))}
            onNext={() => {
              if (data.nextCursor) {
                setCursorStack((s) => [...s, data.nextCursor!]);
              }
            }}
            testIdPrefix="countries"
          />
        </div>
      ) : null}
    </AdminShell>
  );
}
