"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  DataQualityState,
  EmptyState,
  ErrorState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { GeographyDqBadge } from "@/components/ui/GeographyDqBadge";
import { CountryFilterSelect } from "@/components/ui/CountryFilterSelect";
import { CursorPaginationBar } from "@/components/ui/CursorPaginationBar";
import { UnavailableText } from "@/components/ui/AggregateMetricCell";
import { useI18n } from "@/i18n/I18nProvider";
import { presentStatus } from "@/domain/presentation/statusPresentation";
import { presentGeographyDqSeverity } from "@/domain/geography/GeographyDataQuality";
import { useApiFetch } from "@/lib/apiClient";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { CountryListItem } from "@/application/geography/CountriesReadService";
import type {
  GeographyCityListItem,
  GeographyLandmarkListItem,
} from "@/application/geography/geographyListDtos";
import type { GeographyDqSummary } from "@/domain/geography/GeographyDqSummary";
import type { GeographyDqSeverity } from "@/domain/geography/GeographyDataQuality";

import { SectionTabs } from "@/components/ui/DetailSection";
import { adminUi } from "@/components/ui/adminUi";

type Tab = "countries" | "cities" | "landmarks" | "data_quality";

const PAGE_SIZE = 20;

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

export function GeographyPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [tab, setTab] = useState<Tab>("countries");

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "countries", label: t("countries") },
    { id: "cities", label: t("cities") },
    { id: "landmarks", label: t("landmarks") },
    {
      id: "data_quality",
      label: t("dataQuality"),
    },
  ];

  return (
    <AdminShell title={t("geography")}>
      <Breadcrumb items={[{ label: t("geography") }]} />
      <p className={adminUi.secondaryText}>{t("oneCountryOneAgentHint")}</p>
      <SectionTabs
        testIdPrefix="geography-tab"
        listTestId="geography-tabs"
        active={tab}
        onChange={(id) => setTab(id as Tab)}
        items={tabs.map((item) => ({ id: item.id, label: item.label }))}
      />
      {tab === "countries" ? <CountriesTab apiFetch={apiFetch} /> : null}
      {tab === "cities" ? <CitiesTab apiFetch={apiFetch} /> : null}
      {tab === "landmarks" ? <LandmarksTab apiFetch={apiFetch} /> : null}
      {tab === "data_quality" ? <DataQualityTab apiFetch={apiFetch} /> : null}
    </AdminShell>
  );
}

function CountriesTab({
  apiFetch,
}: {
  apiFetch: ReturnType<typeof useApiFetch>;
}) {
  const { locale, t } = useI18n();
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

  return (
    <div>
      <SourceLabelBadge source={source} />
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
      {state === "empty" ? <EmptyState /> : null}
      {data && data.items.length > 0 ? (
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
              {data.items.map((row) => (
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
                    {row.citiesCount?.availability === "unavailable" ? (
                      <UnavailableText locale={locale} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.landmarksCount?.availability === "unavailable" ? (
                      <UnavailableText locale={locale} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <GeographyDqBadge severity={row.dqSeverity ?? null} />
                    {(row.dataQualityWarnings?.length ?? 0) > 0 ? (
                      <div className="mt-1">
                        <DataQualityState
                          message={
                            locale === "ar"
                              ? row.dataQualityWarnings!
                                  .map((w) => w.messageAr)
                                  .join(" · ")
                              : row.dataQualityWarnings!
                                  .map((w) => w.messageEn)
                                  .join(" · ")
                          }
                        />
                      </div>
                    ) : null}
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
              if (data.nextCursor) {
                setCursorStack((s) => [...s, data.nextCursor!]);
              }
            }}
            testIdPrefix="countries"
          />
        </div>
      ) : null}
    </div>
  );
}

function CitiesTab({
  apiFetch,
}: {
  apiFetch: ReturnType<typeof useApiFetch>;
}) {
  const { locale, t } = useI18n();
  const [state, setState] = useState<"idle" | "loading" | "error" | "empty" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<(SourcePayload & {
    items: GeographyCityListItem[];
    nextCursor?: string | null;
    truncated?: boolean;
  }) | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [countryId, setCountryId] = useState("");
  const [status, setStatus] = useState("");
  const [dqSeverity, setDqSeverity] = useState("");
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
      const res = await apiFetch(`/api/geography/cities?${qs}`);
      if (!res.ok) throw new Error("Failed to load cities");
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

  return (
    <div>
      <SourceLabelBadge source={source} />
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
          <option value="unknown">unknown</option>
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
      {data && data.items.length > 0 ? (
        <div
          data-testid="cities-table"
          className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-start">{t("city")}</th>
                <th className="px-4 py-3 text-start">{t("country")}</th>
                <th className="px-4 py-3 text-start">{t("status")}</th>
                <th className="px-4 py-3 text-start">{t("landmarks")}</th>
                <th className="px-4 py-3 text-start">{t("dataQuality")}</th>
                <th className="px-4 py-3 text-start">{t("details")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.cityId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {locale === "ar"
                        ? row.displayNameAr ?? row.displayName ?? "—"
                        : row.displayNameEn ?? row.displayName ?? "—"}
                    </div>
                    <div className="font-mono text-xs text-slate-500">{row.cityId}</div>
                  </td>
                  <td className="px-4 py-3">
                    {row.countryDisplayName ?? row.canonicalCountryId ?? row.countryId ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={row.activeStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <UnavailableText locale={locale} />
                  </td>
                  <td className="px-4 py-3">
                    <GeographyDqBadge severity={row.dqSeverity} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="underline"
                      href={`/geography/cities/${encodeURIComponent(row.cityId)}`}
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
            testIdPrefix="cities"
          />
        </div>
      ) : null}
    </div>
  );
}

function LandmarksTab({
  apiFetch,
}: {
  apiFetch: ReturnType<typeof useApiFetch>;
}) {
  const { locale, t } = useI18n();
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

  return (
    <div>
      <SourceLabelBadge source={source} />
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
      {data && data.items.length > 0 ? (
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
              {data.items.map((row) => (
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
                  </td>
                  <td className="px-4 py-3">
                    {row.countryDisplayName ?? row.canonicalCountryId ?? "—"}
                  </td>
                  <td className="px-4 py-3">{row.cityId ?? "—"}</td>
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
    </div>
  );
}

function DataQualityTab({
  apiFetch,
}: {
  apiFetch: ReturnType<typeof useApiFetch>;
}) {
  const { locale, t } = useI18n();
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
    <div data-testid="geography-dq-panel">
      <SourceLabelBadge source={source} />
      <p className="mb-3 text-sm text-slate-600">
        {t("dqBoundedSummary")}
      </p>
      {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
      {state === "error" ? <ErrorState message={error ?? undefined} onRetry={() => void load()} /> : null}
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
            <h3 className="mb-2 font-semibold">
              {t("topIssues")}
            </h3>
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
  );
}
