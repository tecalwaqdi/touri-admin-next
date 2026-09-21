"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  EmptyState,
  ErrorState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CursorPaginationBar } from "@/components/ui/CursorPaginationBar";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";
import { GeographyCreatePanel } from "@/features/geography/GeographyCreatePanel";
import { GeographyWriteActions } from "@/features/geography/GeographyWriteActions";
import { GeographyEditPanel } from "@/features/geography/GeographyEditPanel";
import { RegionImageActions } from "@/features/geography/RegionImageActions";
import { isQaOrTestCatalogRecord } from "@/domain/catalog/QaTestRecordFilter";
import {
  GeographyGateNotice,
  GeographyHierarchyHints,
  GeographySubNav,
} from "@/features/geography/GeographyChrome";
import { resolveCountryDisplayName } from "@/domain/geography/GeographyPresentation";

type RegionRow = {
  regionId: string;
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  countryId: string | null;
  activeStatus: string;
  mappingStatus: string;
  sorting?: number | null;
  imagePresence?: "present" | "missing" | "unavailable";
};

const PAGE_SIZE = 20;

export function RegionsListPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"idle" | "loading" | "error" | "empty" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<RegionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const hideQa = true;
  const cursor = cursorStack[cursorStack.length - 1] ?? null;

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", String(PAGE_SIZE));
      if (cursor) qs.set("cursor", cursor);
      const res = await apiFetch(`/api/geography/regions?${qs}`);
      if (!res.ok) throw new Error("Failed to load regions");
      const json = (await res.json()) as {
        items: RegionRow[];
        nextCursor?: string | null;
      };
      setItems(json.items);
      setNextCursor(json.nextCursor ?? null);
      setState(json.items.length === 0 ? "empty" : "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch, cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter(
        (row) =>
          !(
            hideQa &&
            isQaOrTestCatalogRecord({
              id: row.regionId,
              displayName: row.displayName,
              displayNameAr: row.displayNameAr,
              displayNameEn: row.displayNameEn,
            })
          ),
      ),
    [hideQa, items],
  );

  return (
    <AdminShell title={t("regions")}>
      <Breadcrumb
        items={[
          { label: t("geography"), href: "/geography" },
          { label: t("regions") },
        ]}
      />
      <GeographyHierarchyHints includeRegionNote />
      <GeographyGateNotice />
      <GeographySubNav />
      <div data-testid="regions-tab">
        <GeographyCreatePanel resource="region" onCreated={() => void load()} />
        {state === "loading" || state === "idle" ? <SkeletonBlock rows={6} /> : null}
        {state === "error" ? (
          <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
        ) : null}
        {state === "empty" || (state === "success" && visible.length === 0) ? (
          <EmptyState
            message={
              state === "empty" ? t("regions") : t("hideTestQaRecords")
            }
          />
        ) : null}
        {state === "success" && visible.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="min-w-full text-sm" data-testid="regions-table">
                <thead className="border-b bg-slate-50 text-start">
                  <tr>
                    <th className="px-4 py-3">{t("regions")}</th>
                    <th className="px-4 py-3">{t("countries")}</th>
                    <th className="px-4 py-3">{t("status")}</th>
                    <th className="px-4 py-3">{t("details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.regionId} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          className="font-medium text-emerald-700 hover:underline"
                          href={`/geography/regions/${encodeURIComponent(row.regionId)}`}
                        >
                          {locale === "ar"
                            ? row.displayNameAr ?? row.displayName
                            : row.displayNameEn ?? row.displayName}
                        </Link>
                        {isQaOrTestCatalogRecord({
                          id: row.regionId,
                          displayName: row.displayName,
                        }) ? (
                          <span className="ms-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-900">
                            {t("qaFlag")}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {row.countryId
                          ? resolveCountryDisplayName({
                              countryId: row.countryId,
                              locale: locale === "ar" ? "ar" : "en",
                            }) ?? row.countryId
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={row.activeStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          className="underline"
                          href={`/geography/regions/${encodeURIComponent(row.regionId)}`}
                        >
                          {t("details")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CursorPaginationBar
              testIdPrefix="regions"
              cursorStack={cursorStack}
              nextCursor={nextCursor}
              boundedHint={t("hierarchyHint")}
              previousLabel={t("previous")}
              nextLabel={t("next")}
              onPrevious={() =>
                setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
              }
              onNext={() => {
                if (nextCursor) setCursorStack((s) => [...s, nextCursor]);
              }}
            />
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}

export function RegionDetailPage({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<(RegionRow & { warnings?: string[] }) | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/api/geography/regions/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("Not found");
      const json = (await res.json()) as RegionRow & { warnings?: string[] };
      setDetail(json);
      setState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const active =
    detail?.activeStatus === "active"
      ? true
      : detail?.activeStatus === "inactive"
        ? false
        : null;

  return (
    <AdminShell title={t("regions")}>
      <Breadcrumb
        items={[
          { label: t("geography"), href: "/geography" },
          { label: t("regions"), href: "/geography/regions" },
          { label: detail?.displayName ?? id },
        ]}
      />
      <GeographySubNav />
      {state === "loading" ? <SkeletonBlock rows={4} /> : null}
      {state === "error" ? <ErrorState message={error ?? t("error")} /> : null}
      {state === "success" && detail ? (
        <div className="space-y-4">
          <dl
            className="mt-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2"
            data-testid="region-detail"
          >
            <div>
              <dt className="text-sm text-slate-500">{t("regions")}</dt>
              <dd>
                {locale === "ar"
                  ? detail.displayNameAr ?? detail.displayName
                  : detail.displayNameEn ?? detail.displayName}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">{t("countries")}</dt>
              <dd>
                {detail.countryId
                  ? resolveCountryDisplayName({
                      countryId: detail.countryId,
                      locale: locale === "ar" ? "ar" : "en",
                    }) ?? detail.countryId
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">{t("status")}</dt>
              <dd>
                <StatusBadge value={detail.activeStatus} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">{t("image")}</dt>
              <dd>
                <StatusBadge value={detail.imagePresence ?? "unavailable"} />
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-slate-500">{t("regionNullableHint")}</dt>
              <dd className={`text-sm text-slate-700 ${adminUi.secondaryText}`}>
                {t("regionOptionalNote")}
              </dd>
            </div>
          </dl>
          <GeographyEditPanel
            resource="region"
            resourceId={detail.regionId}
            displayNameEn={detail.displayNameEn}
            displayNameAr={detail.displayNameAr}
            countryId={detail.countryId}
            sortOrder={detail.sorting}
            active={active}
            preconditionToken={detail.regionId}
            onUpdated={() => void load()}
          />
          <RegionImageActions
            regionId={detail.regionId}
            imagePresence={detail.imagePresence ?? "unavailable"}
            onUpdated={() => void load()}
          />
          <GeographyWriteActions
            resource="region"
            resourceId={detail.regionId}
            active={active}
            preconditionToken={detail.regionId}
            onUpdated={() => void load()}
          />
        </div>
      ) : null}
    </AdminShell>
  );
}

/** @deprecated Prefer RegionsListPage — retained for import compatibility. */
export function RegionsTab({
  apiFetch,
}: {
  apiFetch: ReturnType<typeof useApiFetch>;
}) {
  void apiFetch;
  return <RegionsListPage />;
}
