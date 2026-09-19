"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { presentStatus } from "@/domain/presentation/statusPresentation";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import type { MessageKey } from "@/i18n/messages";
import { resolveCountryDisplayName } from "@/domain/geography/GeographyPresentation";

type GuideRow = {
  id: string;
  displayName: string | null;
  status: string;
  countryId: string | null;
  emailHint: string | null;
};

type GuideAction = {
  kind: "approve" | "reject" | "suspend" | "reactivate";
  label: MessageKey;
};

const STATUS_FILTERS = ["pending", "approved", "rejected", "suspended"] as const;

export function GuidesPage() {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "empty" | "success">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GuideRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    id: string;
    action: GuideAction;
    status: string;
    name: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string>();
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "drivers:approve")
        : false,
    [session.user],
  );
  const writesUi = isControlledWriteChromeEnabled();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const qs = new URLSearchParams({ limit: "50" });
      if (statusFilter) qs.set("status", statusFilter);
      const res = await apiFetch(`/api/guides?${qs}`);
      if (!res.ok) throw new Error(t("requestFailed"));
      const json = (await res.json()) as { items: GuideRow[] };
      setItems(json.items ?? []);
      setState((json.items ?? []).length === 0 ? "empty" : "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch, statusFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const legalActions = (status: string): GuideAction[] => {
    const out: GuideAction[] = [];
    if (status === "pending" || status === "rejected" || status === "suspended") {
      out.push({ kind: "approve", label: "approveAction" });
    }
    if (status === "pending" || status === "approved") {
      out.push({ kind: "reject", label: "rejectAction" });
    }
    if (status === "approved" || status === "pending") {
      out.push({ kind: "suspend", label: "suspendAction" });
    }
    if (status === "suspended") {
      out.push({ kind: "reactivate", label: "reactivateAction" });
    }
    return out;
  };

  const runAction = async (id: string, action: GuideAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingId(id);
    setActionError(undefined);
    try {
      const res = await apiFetch(
        `/api/guides/${encodeURIComponent(id)}/${action.kind}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken: id,
            reasonCode: "operational",
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || json.ok === false) {
        setActionError(json.message ?? json.error ?? t("error"));
        return;
      }
      setConfirming(null);
      await load();
    } catch {
      setActionError(t("error"));
    } finally {
      inFlight.current = false;
      setPendingId(null);
    }
  };

  const statusLabel = (s: string) =>
    presentStatus(s, locale === "ar" ? "ar" : "en");

  const countryLabel = (countryId: string | null) => {
    if (!countryId) return "—";
    return (
      resolveCountryDisplayName({ countryId, locale: locale === "ar" ? "ar" : "en" }) ??
      countryId
    );
  };

  return (
    <AdminShell title={t("guides")}>
      <Breadcrumb items={[{ label: t("guides") }]} />
      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`guide-status-${s}`}
            className={`rounded border px-3 py-1.5 text-sm ${
              statusFilter === s ? "bg-slate-900 text-white" : ""
            }`}
            onClick={() => setStatusFilter(s)}
          >
            {statusLabel(s)}
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
          {items.map((row) => {
            const actions = legalActions(row.status);
            return (
              <li key={row.id} className="rounded-lg border bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.displayName ?? row.id}</p>
                    <p className="text-xs text-slate-500">
                      {row.emailHint ?? "—"} · {countryLabel(row.countryId)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={row.status} />
                    {canWrite && writesUi
                      ? actions.map((action) => (
                          <button
                            key={action.kind}
                            type="button"
                            data-testid={`guide-${action.kind}-${row.id}`}
                            className={`rounded px-2 py-1 text-xs text-white disabled:opacity-50 ${
                              action.kind === "approve" || action.kind === "reactivate"
                                ? "bg-emerald-700"
                                : action.kind === "reject"
                                  ? "bg-rose-700"
                                  : "bg-amber-600"
                            }`}
                            disabled={pendingId === row.id}
                            onClick={() =>
                              setConfirming({
                                id: row.id,
                                action,
                                status: row.status,
                                name: row.displayName ?? row.id,
                              })
                            }
                          >
                            {t(action.label)}
                          </button>
                        ))
                      : null}
                  </div>
                </div>
                {confirming?.id === row.id ? (
                  <ControlledWriteConfirmPanel
                    testIdPrefix={`guide-${confirming.action.kind}`}
                    confirmTemplateKey="confirmGuideWrite"
                    actionLabelKey={confirming.action.label}
                    targetId={confirming.name}
                    stateLabel={statusLabel(confirming.status)}
                    pending={pendingId === row.id}
                    onConfirm={() => void runAction(row.id, confirming.action)}
                    onCancel={() => setConfirming(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {actionError ? (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {actionError}
        </p>
      ) : null}
    </AdminShell>
  );
}
