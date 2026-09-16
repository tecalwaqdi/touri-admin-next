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
import { CursorPaginationBar } from "@/components/ui/CursorPaginationBar";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";
import { GeographyCreatePanel } from "@/features/geography/GeographyCreatePanel";

type RegionRow = {
  regionId: string;
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  countryId: string | null;
  activeStatus: string;
  mappingStatus: string;
};

const PAGE_SIZE = 20;

export function RegionsTab({
  apiFetch,
}: {
  apiFetch: ReturnType<typeof useApiFetch>;
}) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<"idle" | "loading" | "error" | "empty" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<RegionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
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

  return (
    <div data-testid="regions-tab">
      <p className={adminUi.secondaryText}>{t("hierarchyHint")}</p>
      <p className={adminUi.secondaryText}>{t("regionNullableHint")}</p>
      <GeographyCreatePanel resource="region" onCreated={() => void load()} />
      {state === "loading" || state === "idle" ? <SkeletonBlock rows={6} /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "empty" ? <EmptyState message={t("regions")} /> : null}
      {state === "success" ? (
        <>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="min-w-full text-sm" data-testid="regions-table">
              <thead className="border-b bg-slate-50 text-start">
                <tr>
                  <th className="px-4 py-3">{t("regions")}</th>
                  <th className="px-4 py-3">{t("countries")}</th>
                  <th className="px-4 py-3">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
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
                    </td>
                    <td className="px-4 py-3">{row.countryId ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={row.activeStatus} />
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
  );
}

export function RegionDetailPage({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<(RegionRow & { warnings?: string[] }) | null>(null);

  useEffect(() => {
    void (async () => {
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
    })();
  }, [apiFetch, id]);

  return (
    <AdminShell title={t("regions")}>
      <Breadcrumb
        items={[
          { label: t("geography"), href: "/geography" },
          { label: t("regions") },
          { label: detail?.displayName ?? id },
        ]}
      />
      {state === "loading" ? <SkeletonBlock rows={4} /> : null}
      {state === "error" ? <ErrorState message={error ?? t("error")} /> : null}
      {state === "success" && detail ? (
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
            <dd>{detail.countryId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">{t("status")}</dt>
            <dd>
              <StatusBadge value={detail.activeStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">{t("regionNullableHint")}</dt>
            <dd>nullable_ok</dd>
          </div>
        </dl>
      ) : null}
    </AdminShell>
  );
}
