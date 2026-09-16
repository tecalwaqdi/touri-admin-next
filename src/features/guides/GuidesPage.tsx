"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";

type GuideRow = {
  id: string;
  displayName: string | null;
  status: string;
  countryId: string | null;
  emailHint: string | null;
};

export function GuidesPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "empty" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GuideRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const qs = new URLSearchParams({ limit: "50" });
      if (statusFilter) qs.set("status", statusFilter);
      const res = await apiFetch(`/api/guides?${qs}`);
      if (!res.ok) throw new Error("Failed to load guides");
      const json = (await res.json()) as { items: GuideRow[] };
      setItems(json.items);
      setState(json.items.length === 0 ? "empty" : "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell title={t("guides")}>
      <Breadcrumb items={[{ label: t("guides") }]} />
      <div className="mb-3 flex flex-wrap gap-2">
        {["pending", "approved", "rejected", "suspended"].map((s) => (
          <button
            key={s}
            type="button"
            className={`rounded border px-3 py-1.5 text-sm ${
              statusFilter === s ? "bg-slate-900 text-white" : ""
            }`}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {state === "loading" ? <SkeletonBlock rows={6} /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "empty" ? <EmptyState message={t("guides")} /> : null}
      {state === "success" ? (
        <ul className="space-y-2" data-testid="guides-list">
          {items.map((row) => (
            <li key={row.id} className="rounded-lg border bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{row.displayName ?? row.id}</p>
                  <p className="text-xs text-slate-500">
                    {row.emailHint ?? "—"} · {row.countryId ?? "—"}
                  </p>
                </div>
                <StatusBadge value={row.status} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminShell>
  );
}
