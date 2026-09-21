"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { GeographyDqBadge } from "@/components/ui/GeographyDqBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { GeographyDqSummary } from "@/domain/geography/GeographyDqSummary";
import type { GeographyDqSeverity } from "@/domain/geography/GeographyDataQuality";
import {
  GeographyGateNotice,
  GeographyHierarchyHints,
  GeographySubNav,
} from "@/features/geography/GeographyChrome";

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

export function DataQualityPage() {
  const { locale, t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<(GeographyDqSummary & SourcePayload) | null>(
    null,
  );

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const res = await apiFetch("/api/geography/data-quality");
      if (!res.ok) throw new Error("Failed to load data quality summary");
      const json = await res.json();
      setData(json);
      setState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const source = useSource(data);

  const metricLabel = (m: GeographyDqSummary[keyof GeographyDqSummary]) => {
    if (!m || typeof m !== "object" || !("labelEn" in m)) return null;
    const metric = m as GeographyDqSummary["countriesTotalInView"];
    return (
      <div className="rounded border border-slate-200 bg-white p-3">
        <div className="text-xs text-slate-500">
          {locale === "ar" ? metric.labelAr : metric.labelEn}
        </div>
        <div className="text-lg font-semibold">{metric.value ?? "—"}</div>
        <div className="text-xs text-amber-700" data-testid="dq-metric-accuracy">
          {metric.accuracy}
        </div>
      </div>
    );
  };

  return (
    <AdminShell title={t("dataQuality")}>
      <Breadcrumb
        items={[
          { label: t("geography"), href: "/geography" },
          { label: t("dataQuality") },
        ]}
      />
      <GeographyHierarchyHints />
      <GeographyGateNotice />
      <GeographySubNav />
      <div data-testid="geography-dq-panel">
        <SourceLabelBadge source={source} />
        <p className="mb-3 text-sm text-slate-600">{t("dqBoundedSummary")}</p>
        {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
        {state === "error" ? (
          <ErrorState message={error ?? undefined} onRetry={() => void load()} />
        ) : null}
        {data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {metricLabel(data.countriesTotalInView)}
              {metricLabel(data.canonicalCountries)}
              {metricLabel(data.aliasesNormalized)}
              {metricLabel(data.legacyOrMalformedCountries)}
              {metricLabel(data.countriesWithoutActiveAgent)}
              {metricLabel(data.countriesWithDuplicateActiveAgents)}
              {metricLabel(data.countriesWithSuspiciousAgent)}
              {metricLabel(data.citiesWithBrokenCountryRefs)}
              {metricLabel(data.landmarksWithBrokenCityOrCountryRefs)}
              {metricLabel(data.landmarksMissingDisplayMetadata)}
              {metricLabel(data.qaPilotLegacyRecordCount)}
            </div>
            <div className="rounded border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-semibold">{t("topIssues")}</h3>
              <ul className="space-y-2 text-sm">
                {(data.topIssues ?? []).slice(0, 20).map((issue, idx) => (
                  <li key={`${issue.code}-${idx}`} className="flex flex-wrap gap-2">
                    <GeographyDqBadge severity={issue.severity as GeographyDqSeverity} />
                    <span>
                      {locale === "ar" ? issue.messageAr : issue.messageEn}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-500">{t("boundedSampleHint")}</p>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
