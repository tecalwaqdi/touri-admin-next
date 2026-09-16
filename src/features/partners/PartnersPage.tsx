"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";

type PartnerRow = {
  partnerLandmarkId: string;
  displayName: string | null;
  countryId: string | null;
  cityId: string | null;
  activeStatus: string;
};

export function PartnersPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "empty" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PartnerRow[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch("/api/partners?limit=50");
      if (!res.ok) throw new Error("Failed to load partners");
      const json = (await res.json()) as { items: PartnerRow[]; note?: string };
      setItems(json.items);
      setState(json.items.length === 0 ? "empty" : "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell title={t("partners")}>
      <Breadcrumb items={[{ label: t("partners") }]} />
      <p className={adminUi.secondaryText}>{t("partnerFlag")}</p>
      {state === "loading" ? <SkeletonBlock rows={6} /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "empty" ? <EmptyState message={t("partners")} /> : null}
      {state === "success" ? (
        <ul className="space-y-2" data-testid="partners-list">
          {items.map((row) => (
            <li key={row.partnerLandmarkId} className="rounded-lg border bg-white px-4 py-3">
              <Link
                className="font-medium text-emerald-700 hover:underline"
                href={`/geography/landmarks/${encodeURIComponent(row.partnerLandmarkId)}`}
              >
                {row.displayName ?? row.partnerLandmarkId}
              </Link>
              <p className="text-xs text-slate-500">
                {row.countryId ?? "—"} · {row.cityId ?? "—"} · {row.activeStatus}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminShell>
  );
}
