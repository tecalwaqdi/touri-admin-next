"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CountryFilterSelect } from "@/components/ui/CountryFilterSelect";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { isQaOrTestCatalogRecord } from "@/domain/catalog/QaTestRecordFilter";
import type { MessageKey } from "@/i18n/messages";

type PartnerRow = {
  partnerLandmarkId: string;
  displayName: string | null;
  displayNameAr?: string | null;
  displayNameEn?: string | null;
  countryId: string | null;
  cityId: string | null;
  activeStatus: string;
};

type PartnerAction = {
  kind: "activate" | "deactivate" | "archive";
  label: MessageKey;
};

export function PartnersPage() {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "empty" | "success">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PartnerRow[]>([]);
  const [countryId, setCountryId] = useState("");
  const hideQa = true;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    id: string;
    action: PartnerAction;
    status: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string>();
  const inFlight = useRef(false);

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
      const collected: PartnerRow[] = [];
      let cursor: string | null = null;
      let pages = 0;
      while (pages < 20) {
        pages += 1;
        const qs = new URLSearchParams({ limit: "50" });
        if (countryId) qs.set("countryId", countryId);
        if (cursor) qs.set("cursor", cursor);
        const res = await apiFetch(`/api/partners?${qs}`);
        if (!res.ok) throw new Error(t("requestFailed"));
        const json = (await res.json()) as {
          items?: PartnerRow[];
          nextCursor?: string | null;
        };
        collected.push(...(json.items ?? []));
        cursor = json.nextCursor ?? null;
        // Stop once we have rows, or catalog is exhausted.
        if (collected.length > 0 || !cursor) break;
      }
      setItems(collected);
      setState(collected.length === 0 ? "empty" : "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch, countryId, t]);

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
              id: row.partnerLandmarkId,
              displayName: row.displayName,
              displayNameAr: row.displayNameAr,
              displayNameEn: row.displayNameEn,
            })
          ),
      ),
    [hideQa, items],
  );

  const runAction = async (id: string, action: PartnerAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingId(id);
    setActionError(undefined);
    try {
      const res = await apiFetch(
        `/api/partners/${encodeURIComponent(id)}/${action.kind}`,
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

  return (
    <AdminShell title={t("partners")}>
      <Breadcrumb items={[{ label: t("partners") }]} />
      <p className={adminUi.secondaryText}>{t("partnerFlag")}</p>
      <p className={adminUi.secondaryText}>{t("partnersAddHint")}</p>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Link
          href="/geography"
          className="rounded border border-emerald-700 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-50"
        >
          {t("geographyCreateAction")} — {t("partnerFlag")}
        </Link>
      </div>
      {state === "loading" ? <SkeletonBlock rows={6} /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "empty" || (state === "success" && visible.length === 0) ? (
        <EmptyState
          message={
            state === "empty" ? t("partnersEmpty") : t("hideTestQaRecords")
          }
        />
      ) : null}
      {state === "success" && visible.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm" data-testid="partners-list">
            <thead className="border-b bg-slate-50 text-start">
              <tr>
                <th className="px-4 py-3">{t("partners")}</th>
                <th className="px-4 py-3">{t("country")}</th>
                <th className="px-4 py-3">{t("status")}</th>
                {canWrite && writesUi ? (
                  <th className="px-4 py-3">{t("geography")}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const actions: PartnerAction[] = [];
                if (row.activeStatus !== "active") {
                  actions.push({ kind: "activate", label: "activateAction" });
                }
                if (row.activeStatus !== "inactive") {
                  actions.push({
                    kind: "deactivate",
                    label: "deactivateAction",
                  });
                }
                actions.push({ kind: "archive", label: "geographyArchiveAction" });
                return (
                  <tr key={row.partnerLandmarkId} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        className="font-medium text-emerald-700 hover:underline"
                        href={`/partners/${encodeURIComponent(row.partnerLandmarkId)}`}
                      >
                        {(locale === "ar"
                          ? row.displayNameAr ?? row.displayName
                          : row.displayNameEn ?? row.displayName) ??
                          row.partnerLandmarkId}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">
                        {row.cityId ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.countryId ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={row.activeStatus} />
                    </td>
                    {canWrite && writesUi ? (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {actions.map((action) => (
                            <button
                              key={action.kind}
                              type="button"
                              className="rounded border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                              disabled={pendingId === row.partnerLandmarkId}
                              onClick={() =>
                                setConfirming({
                                  id: row.partnerLandmarkId,
                                  action,
                                  status: row.activeStatus,
                                })
                              }
                            >
                              {t(action.label)}
                            </button>
                          ))}
                        </div>
                        {confirming?.id === row.partnerLandmarkId ? (
                          <ControlledWriteConfirmPanel
                            testIdPrefix={`partner-${confirming.action.kind}`}
                            confirmTemplateKey="confirmAgentWrite"
                            actionLabelKey={confirming.action.label}
                            targetId={row.partnerLandmarkId}
                            stateLabel={row.activeStatus}
                            pending={pendingId === row.partnerLandmarkId}
                            onConfirm={() =>
                              void runAction(row.partnerLandmarkId, confirming.action)
                            }
                            onCancel={() => setConfirming(null)}
                          />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {actionError ? (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {actionError}
        </p>
      ) : null}
    </AdminShell>
  );
}
