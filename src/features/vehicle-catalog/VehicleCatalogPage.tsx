"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";

type VehicleRow = {
  id: string;
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  codeCar: string | null;
  hourlyRateSr: number | null;
  activeStatus: string;
};

export function VehicleCatalogPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "empty" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<VehicleRow[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch("/api/vehicle-catalog?limit=50");
      if (!res.ok) throw new Error("Failed to load vehicle catalog");
      const json = (await res.json()) as { items: VehicleRow[] };
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
    <AdminShell title={t("vehicleCatalog")}>
      <Breadcrumb items={[{ label: t("vehicleCatalog") }]} />
      <p className={adminUi.secondaryText}>
        {t("canonicalVehicleSelect")} · {t("freeTextVehicleCompat")}
      </p>
      {state === "loading" ? <SkeletonBlock rows={6} /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "empty" ? <EmptyState message={t("vehicleCatalog")} /> : null}
      {state === "success" ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm" data-testid="vehicle-catalog-table">
            <thead className="border-b bg-slate-50 text-start">
              <tr>
                <th className="px-4 py-3">{t("vehicleCatalog")}</th>
                <th className="px-4 py-3">{t("codeCar")}</th>
                <th className="px-4 py-3">{t("hourlyRate")}</th>
                <th className="px-4 py-3">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-emerald-700 hover:underline"
                      href={`/vehicle-catalog/${encodeURIComponent(row.id)}`}
                    >
                      {locale === "ar"
                        ? row.displayNameAr ?? row.displayName
                        : row.displayNameEn ?? row.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.codeCar ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.hourlyRateSr ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={row.activeStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminShell>
  );
}
