"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";
import { filterByNeedle } from "@/domain/parity/P2GapClassification";
import { presentStatus } from "@/domain/presentation/statusPresentation";

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
  const [state, setState] = useState<"loading" | "error" | "empty" | "success">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<VehicleRow[]>([]);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [status, setStatus] = useState("");

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

  const filtered = useMemo(() => {
    let rows = items;
    if (status) {
      rows = rows.filter((r) => r.activeStatus === status);
    }
    rows = filterByNeedle(rows, searchApplied, (r) => [
      r.displayName,
      r.displayNameAr,
      r.displayNameEn,
      r.codeCar,
      r.id,
    ]);
    return rows;
  }, [items, status, searchApplied]);

  return (
    <AdminShell title={t("vehicleCatalog")}>
      <Breadcrumb items={[{ label: t("vehicleCatalog") }]} />
      <p className={adminUi.secondaryText}>
        {t("canonicalVehicleSelect")} · {t("freeTextVehicleCompat")}
      </p>
      <FilterBar testId="vehicle-catalog-filters" hint={t("searchLoadedPageHint")}>
        <FilterField label={t("search")}>
          <input
            data-testid="vehicle-catalog-search"
            className={adminUi.filterControl}
            aria-label={t("search")}
            placeholder={t("searchWithinLoaded")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </FilterField>
        <FilterField label={t("status")}>
          <select
            data-testid="vehicle-catalog-status-filter"
            className={adminUi.filterControl}
            aria-label={t("status")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t("allStatuses")}</option>
            <option value="active">{presentStatus("active", locale)}</option>
            <option value="inactive">{presentStatus("inactive", locale)}</option>
          </select>
        </FilterField>
        <button
          type="button"
          className={adminUi.btnPrimary}
          onClick={() => setSearchApplied(search.trim())}
        >
          {t("filters")}
        </button>
        <button
          type="button"
          className={adminUi.btnGhost}
          data-testid="vehicle-catalog-reset-filters"
          onClick={() => {
            setSearch("");
            setSearchApplied("");
            setStatus("");
          }}
        >
          {t("resetFilters")}
        </button>
      </FilterBar>
      {state === "loading" ? <SkeletonBlock rows={6} /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "empty" || (state === "success" && filtered.length === 0) ? (
        <EmptyState message={t("vehicleCatalog")} />
      ) : null}
      {state === "success" && filtered.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table
            className="min-w-full text-sm"
            data-testid="vehicle-catalog-table"
          >
            <thead className="border-b bg-slate-50 text-start">
              <tr>
                <th className="px-4 py-3">{t("vehicleCatalog")}</th>
                <th className="px-4 py-3">{t("codeCar")}</th>
                <th className="px-4 py-3">{t("hourlyRate")}</th>
                <th className="px-4 py-3">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {locale === "ar"
                        ? (row.displayNameAr ?? row.displayName)
                        : (row.displayNameEn ?? row.displayName)}
                    </span>
                    <div className="font-mono text-xs text-slate-500">{row.id}</div>
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
