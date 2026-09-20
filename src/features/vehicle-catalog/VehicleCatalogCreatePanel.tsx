"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";

/**
 * Gated vehicle type create — Production write flags remain authoritative.
 */
export function VehicleCatalogCreatePanel({
  onCreated,
}: {
  onCreated?: (id: string) => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [displayNameEn, setDisplayNameEn] = useState("");
  const [displayNameAr, setDisplayNameAr] = useState("");
  const [codeCar, setCodeCar] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "agents:manage")
        : false,
    [session.user],
  );

  if (!canWrite || !isControlledWriteChromeEnabled()) return null;

  const run = async () => {
    if (inFlight.current) return;
    const id = resourceId.trim();
    if (!id || !displayNameEn.trim() || !displayNameAr.trim()) {
      setError(t("error"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const metadata: Record<string, string | number | null> = {
        displayNameEn: displayNameEn.trim(),
        displayNameAr: displayNameAr.trim(),
      };
      if (codeCar.trim()) metadata.codeCar = codeCar.trim();
      const sr = hourlyRate.trim();
      if (sr) {
        const parsed = Number(sr);
        if (!Number.isFinite(parsed)) {
          setError(t("error"));
          return;
        }
        metadata.sr = parsed;
      }

      const res = await apiFetch(
        `/api/vehicle-catalog/${encodeURIComponent(id)}/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken: "create",
            reasonCode: "operational",
            metadata,
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
      setResourceId("");
      setDisplayNameEn("");
      setDisplayNameAr("");
      setCodeCar("");
      setHourlyRate("");
      onCreated?.(id);
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div data-testid="vehicle-catalog-create" className="mb-3">
      {!open ? (
        <button
          type="button"
          className={adminUi.btnGhost}
          onClick={() => setOpen(true)}
        >
          {t("geographyCreateAction")}
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("id")}</span>
              <input
                className={adminUi.filterControl}
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("name")} (EN)</span>
              <input
                className={adminUi.filterControl}
                value={displayNameEn}
                onChange={(e) => setDisplayNameEn(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("name")} (AR)</span>
              <input
                className={adminUi.filterControl}
                value={displayNameAr}
                onChange={(e) => setDisplayNameAr(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("codeCar")}</span>
              <input
                className={adminUi.filterControl}
                value={codeCar}
                onChange={(e) => setCodeCar(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("hourlyRate")}</span>
              <input
                className={adminUi.filterControl}
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={adminUi.btnPrimary}
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              {t("geographyCreateAction")}
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
              testIdPrefix="vehicle-catalog-create"
              confirmTemplateKey="confirmAgentWrite"
              actionLabelKey="geographyCreateAction"
              targetId={resourceId.trim() || "—"}
              stateLabel={t("unknown")}
              pending={pending}
              onConfirm={() => void run()}
              onCancel={() => setConfirming(false)}
            />
          ) : null}
          {error ? (
            <p className="mt-2 text-sm text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="mt-2 text-sm text-emerald-700" role="status">
              {success}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
