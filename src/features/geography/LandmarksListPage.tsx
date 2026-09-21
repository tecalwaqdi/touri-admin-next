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
import { CountryFilterSelect } from "@/components/ui/CountryFilterSelect";
import { CursorPaginationBar } from "@/components/ui/CursorPaginationBar";
import { useI18n } from "@/i18n/I18nProvider";
import { presentGeographyDqSeverity } from "@/domain/geography/GeographyDataQuality";
import { useApiFetch } from "@/lib/apiClient";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { GeographyLandmarkListItem } from "@/application/geography/geographyListDtos";
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

export function LandmarksListPage() {
  const { locale, t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"idle" | "loading" | "error" | "empty" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<(SourcePayload & {
    items: GeographyLandmarkListItem[];
    nextCursor?: string | null;
    truncated?: boolean;
  }) | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [countryId, setCountryId] = useState("");
  const [status, setStatus] = useState("");
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
      if (countryId) qs.set("countryId", countryId);
      if (status) qs.set("status", status);
      if (dqSeverity) qs.set("dqSeverity", dqSeverity);
      const res = await apiFetch(`/api/geography/landmarks?${qs}`);
      if (!res.ok) throw new Error("Failed to load landmarks");
      const json = await res.json();
      setData(json);
      setState((json.items?.length ?? 0) === 0 ? "empty" : "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch, cursor, countryId, status, dqSeverity]);

  useEffect(() => {
    void load();
  }, [load]);

  const source = useSource(data);
  const visibleLandmarks =
    data?.items.filter((row) => !(hideTestQa && isTestOrQaGeographyRow(row))) ??
    [];

  return (
    <AdminShell title={t("landmarks")}>
      <Breadcrumb
        items={[
          { label: t("geography"), href: "/geography" },
          { label: t("landmarks") },
        ]}
      />
      <GeographyHierarchyHints />
      <GeographyGateNotice />
      <GeographySubNav />
      <SourceLabelBadge source={source} />
      <GeographyCreatePanel resource="landmark" onCreated={() => void load()} />
      <div className="mb-3 flex flex-wrap gap-2">
        <CountryFilterSelect
          value={countryId}
          locale={locale}
          allLabel={t("allCountries")}
          onChange={(v) => {
            setCursorStack([null]);
            setCountryId(v);
          }}
        />
        <select
          className="rounded border px-2 py-1 text-sm"
          value={status}
          onChange={(e) => {
            setCursorStack([null]);
            setStatus(e.target.value);
          }}
        >
          <option value="">{t("status")}</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
        </select>
        <select
          className="rounded border px-2 py-1 text-sm"
          value={dqSeverity}
          onChange={(e) => {
            setCursorStack([null]);
            setDqSeverity(e.target.value);
          }}
        >
          <option value="">{t("dataQuality")}</option>
          <option value="WARNING">{presentGeographyDqSeverity("WARNING", locale === "ar" ? "ar" : "en")}</option>
          <option value="ERROR">{presentGeographyDqSeverity("ERROR", locale === "ar" ? "ar" : "en")}</option>
        </select>
      </div>
      {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
      {state === "error" ? <ErrorState message={error ?? undefined} onRetry={() => void load()} /> : null}
      {state === "empty" ? <EmptyState /> : null}
      {data && visibleLandmarks.length > 0 ? (
        <div
          data-testid="landmarks-table"
          className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-start">{t("landmark")}</th>
                <th className="px-4 py-3 text-start">{t("country")}</th>
                <th className="px-4 py-3 text-start">{t("city")}</th>
                <th className="px-4 py-3 text-start">{t("status")}</th>
                <th className="px-4 py-3 text-start">{t("image")}</th>
                <th className="px-4 py-3 text-start">{t("coords")}</th>
                <th className="px-4 py-3 text-start">{t("dataQuality")}</th>
                <th className="px-4 py-3 text-start">{t("details")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleLandmarks.map((row) => (
                <tr key={row.landmarkId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {locale === "ar"
                        ? row.displayNameAr ?? row.displayName ?? "—"
                        : row.displayNameEn ?? row.displayName ?? "—"}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {row.landmarkId}
                    </div>
                    {isTestOrQaGeographyRow(row) ? (
                      <span className="mt-1 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                        {t("testOrQaRecord")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {row.countryDisplayName ?? row.canonicalCountryId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.cityDisplayName ?? (
                      <span className="font-mono text-xs text-slate-500">
                        {row.cityId ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={row.activeStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={row.imagePresence} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={row.coordinatesPresence} />
                  </td>
                  <td className="px-4 py-3">
                    <GeographyDqBadge severity={row.dqSeverity} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="underline"
                      href={`/geography/landmarks/${encodeURIComponent(row.landmarkId)}`}
                    >
                      {t("details")}
                    </Link>
                  </td>
                </tr>
              ))}
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
              if (data.nextCursor) setCursorStack((s) => [...s, data.nextCursor!]);
            }}
            testIdPrefix="landmarks"
          />
        </div>
      ) : null}
    </AdminShell>
  );
}
