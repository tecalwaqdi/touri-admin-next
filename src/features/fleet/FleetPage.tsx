"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { isDemoFleetRecord } from "@/domain/catalog/QaTestRecordFilter";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import type { MessageKey } from "@/i18n/messages";

type FleetRow = {
  id: string;
  displayName: string | null;
  licenseNumber: string | null;
  countryId: string | null;
  activeStatus: string;
};

export function FleetPage() {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "empty" | "success">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FleetRow[]>([]);
  const [hideQa, setHideQa] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    id: string;
    action: "activate" | "deactivate" | "archive";
    label: MessageKey;
    status: string;
  } | null>(null);

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "agents:manage")
        : false,
    [session.user],
  );
  const writesUi = isControlledWriteChromeEnabled();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch("/api/fleet?limit=50");
      if (!res.ok) throw new Error(t("requestFailed"));
      const json = (await res.json()) as { items: FleetRow[] };
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

  const visible = useMemo(
    () =>
      items.filter(
        (row) =>
          !(
            hideQa &&
            isDemoFleetRecord({
              id: row.id,
              displayName: row.displayName,
              licenseNumber: row.licenseNumber,
            })
          ),
      ),
    [hideQa, items],
  );

  const runAction = async (
    id: string,
    action: "activate" | "deactivate" | "archive",
  ) => {
    setPendingId(id);
    try {
      const res = await apiFetch(
        `/api/fleet/${encodeURIComponent(id)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken: id,
            reasonCode: "operational",
          }),
        },
      );
      if (!res.ok) throw new Error(t("error"));
      setConfirming(null);
      await load();
    } catch {
      setError(t("error"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <AdminShell title={t("fleet")}>
      <Breadcrumb items={[{ label: t("fleet") }]} />
      <label className="mb-3 inline-flex items-center gap-2 rounded border px-2 py-1 text-sm">
        <input
          type="checkbox"
          checked={hideQa}
          onChange={(e) => setHideQa(e.target.checked)}
        />
        {t("hideTestQaRecords")}
      </label>
      {state === "loading" ? <SkeletonBlock rows={6} /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "empty" || (state === "success" && visible.length === 0) ? (
        <EmptyState
          message={
            state === "empty" ? t("fleet") : t("hideTestQaRecords")
          }
        />
      ) : null}
      {state === "success" && visible.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm" data-testid="fleet-table">
            <thead className="border-b bg-slate-50 text-start">
              <tr>
                <th className="px-4 py-3">{t("fleet")}</th>
                <th className="px-4 py-3">{t("licenseNumber")}</th>
                <th className="px-4 py-3">{t("status")}</th>
                {canWrite && writesUi ? (
                  <th className="px-4 py-3">{t("geography")}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-emerald-700 hover:underline"
                      href={`/fleet/${encodeURIComponent(row.id)}`}
                    >
                      {row.displayName ?? row.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.licenseNumber ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={row.activeStatus} />
                  </td>
                  {canWrite && writesUi ? (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.activeStatus !== "active" ? (
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() =>
                              setConfirming({
                                id: row.id,
                                action: "activate",
                                label: "activateAction",
                                status: row.activeStatus,
                              })
                            }
                          >
                            {t("activateAction")}
                          </button>
                        ) : null}
                        {row.activeStatus !== "inactive" ? (
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            onClick={() =>
                              setConfirming({
                                id: row.id,
                                action: "deactivate",
                                label: "deactivateAction",
                                status: row.activeStatus,
                              })
                            }
                          >
                            {t("deactivateAction")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() =>
                            setConfirming({
                              id: row.id,
                              action: "archive",
                              label: "geographyArchiveAction",
                              status: row.activeStatus,
                            })
                          }
                        >
                          {t("geographyArchiveAction")}
                        </button>
                      </div>
                      {confirming?.id === row.id ? (
                        <ControlledWriteConfirmPanel
                          testIdPrefix={`fleet-${confirming.action}`}
                          confirmTemplateKey="confirmAgentWrite"
                          actionLabelKey={confirming.label}
                          targetId={row.displayName ?? row.id}
                          stateLabel={row.activeStatus}
                          pending={pendingId === row.id}
                          onConfirm={() =>
                            void runAction(row.id, confirming.action)
                          }
                          onCancel={() => setConfirming(null)}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminShell>
  );
}
