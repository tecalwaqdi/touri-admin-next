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
import { isQaOrTestCatalogRecord } from "@/domain/catalog/QaTestRecordFilter";
import {
  detectVehicleCodeConflicts,
  vehicleIdsInConflict,
} from "@/domain/catalog/VehicleCodeConflict";

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
  const [hideQa, setHideQa] = useState(true);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch("/api/vehicle-catalog?limit=50");
      if (!res.ok) throw new Error(t("requestFailed"));
      const json = (await res.json()) as { items: VehicleRow[] };
      setItems(json.items ?? []);
      setState((json.items ?? []).length === 0 ? "empty" : "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const conflicts = useMemo(
    () =>
      detectVehicleCodeConflicts(
        items.map((r) => ({
          id: r.id,
          codeCar: r.codeCar,
          hourlyRateSr: r.hourlyRateSr,
          displayName: r.displayName,
        })),
      ),
    [items],
  );
  const conflictIds = useMemo(
    () => vehicleIdsInConflict(conflicts),
    [conflicts],
  );
  const conflictById = useMemo(() => {
    const map = new Map<string, (typeof conflicts)[number]>();
    for (const c of conflicts) {
      for (const id of c.vehicleIds) map.set(id, c);
    }
    return map;
  }, [conflicts]);

  const filtered = useMemo(() => {
    let rows = items;
    if (hideQa) {
      rows = rows.filter(
        (r) =>
          !isQaOrTestCatalogRecord({
            id: r.id,
            displayName: r.displayName,
            displayNameAr: r.displayNameAr,
            displayNameEn: r.displayNameEn,
            codeCar: r.codeCar,
          }),
      );
    }
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
  }, [items, status, searchApplied, hideQa]);

  return (
    <AdminShell title={t("vehicleCatalog")}>
      <Breadcrumb items={[{ label: t("vehicleCatalog") }]} />
      <p className={adminUi.secondaryText}>
        {t("canonicalVehicleSelect")} · {t("freeTextVehicleCompat")}
      </p>
      {conflicts.length > 0 ? (
        <div
          data-testid="vehicle-code-conflicts"
          className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          <p className="font-medium">
            {t("conflictFlag")} / {t("duplicateFlag")}
          </p>
          <ul className="mt-1 list-disc ps-5">
            {conflicts.map((c) => (
              <li key={`${c.kind}-${c.code}`}>
                {locale === "ar" ? c.messageAr : c.messageEn}:{" "}
                {c.vehicleIds.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
        <label className="inline-flex items-center gap-2 rounded border px-2 py-1 text-sm">
          <input
            data-testid="vehicle-hide-test-qa"
            type="checkbox"
            checked={hideQa}
            onChange={(e) => setHideQa(e.target.checked)}
          />
          {t("hideTestQaRecords")}
        </label>
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
                <th className="px-4 py-3">{t("dataQuality")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const conflict = conflictById.get(row.id);
                const isQa = isQaOrTestCatalogRecord({
                  id: row.id,
                  displayName: row.displayName,
                  displayNameAr: row.displayNameAr,
                  displayNameEn: row.displayNameEn,
                });
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {locale === "ar"
                          ? (row.displayNameAr ?? row.displayName)
                          : (row.displayNameEn ?? row.displayName)}
                      </span>
                      <div className="font-mono text-xs text-slate-500">
                        {row.id}
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.codeCar ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.hourlyRateSr ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={row.activeStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {isQa ? (
                          <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-900">
                            {t("qaFlag")}
                          </span>
                        ) : null}
                        {conflict?.kind === "DUPLICATE" ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                            {t("duplicateFlag")}
                          </span>
                        ) : null}
                        {conflict?.kind === "CONFLICT" ? (
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-900">
                            {t("conflictFlag")}
                          </span>
                        ) : null}
                        {!isQa && !conflictIds.has(row.id) ? "—" : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminShell>
  );
}
