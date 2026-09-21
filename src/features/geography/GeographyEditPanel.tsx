"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";

type GeographyResource = "country" | "region" | "city" | "landmark";

/**
 * Gated geography metadata edit — Domain update_metadata only.
 */
export function GeographyEditPanel({
  resource,
  resourceId,
  displayNameEn,
  displayNameAr,
  active,
  preconditionToken,
  onUpdated,
}: {
  resource: GeographyResource;
  resourceId: string;
  displayNameEn: string | null;
  displayNameAr: string | null;
  active: boolean | null;
  preconditionToken: string;
  onUpdated?: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [nameEn, setNameEn] = useState(displayNameEn ?? "");
  const [nameAr, setNameAr] = useState(displayNameAr ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "agents:manage") ||
          hasPermission(session.user.permissions, "users:manage")
        : false,
    [session.user],
  );

  if (!canWrite || !isControlledWriteChromeEnabled()) return null;

  const run = async () => {
    if (inFlight.current) return;
    if (!nameEn.trim() || !nameAr.trim()) {
      setError(t("error"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(
        `/api/geography/${resource}/${encodeURIComponent(resourceId)}/update_metadata`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedActive: active,
            preconditionToken,
            reasonCode: "operational",
            metadata: {
              displayNameEn: nameEn.trim(),
              displayNameAr: nameAr.trim(),
            },
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        setError(json.message ?? json.error ?? json.code ?? t("error"));
        return;
      }
      setSuccess(t("writeApplied"));
      setConfirming(false);
      setOpen(false);
      onUpdated?.();
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <section
      data-testid={`geography-edit-${resource}`}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {t("geographyEditAction")}
        </h3>
        {!open ? (
          <button
            type="button"
            className={adminUi.btnSecondary}
            data-testid={`geography-edit-open-${resource}`}
            onClick={() => {
              setNameEn(displayNameEn ?? "");
              setNameAr(displayNameAr ?? "");
              setOpen(true);
              setError(undefined);
              setSuccess(undefined);
            }}
          >
            {t("geographyEditAction")}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("name")} (EN)</span>
              <input
                className={adminUi.filterControl}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("name")} (AR)</span>
              <input
                className={adminUi.filterControl}
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={adminUi.btnPrimary}
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              {t("save")}
            </button>
            <button
              type="button"
              className={adminUi.btnGhost}
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </button>
          </div>
          {confirming ? (
            <ControlledWriteConfirmPanel
              testIdPrefix={`geography-edit-${resource}`}
              confirmTemplateKey="confirmGeographyWrite"
              actionLabelKey="geographyEditAction"
              targetId={resourceId}
              stateLabel={active == null ? t("unknown") : String(active)}
              pending={pending}
              onConfirm={() => void run()}
              onCancel={() => setConfirming(false)}
            />
          ) : null}
          {error ? (
            <p className="text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm text-emerald-700" role="status">
              {success}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
