"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";
import { presentStatus } from "@/domain/presentation/statusPresentation";

type VehicleFields = {
  id: string;
  displayNameEn: string | null;
  displayNameAr: string | null;
  codeCar: string | null;
  hourlyRateSr: number | null;
  activeStatus: string;
};

export function VehicleCatalogMetadataPanel({
  vehicle,
  onUpdated,
}: {
  vehicle: VehicleFields;
  onUpdated?: () => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [displayNameEn, setDisplayNameEn] = useState(
    vehicle.displayNameEn ?? "",
  );
  const [displayNameAr, setDisplayNameAr] = useState(
    vehicle.displayNameAr ?? "",
  );
  const [codeCar, setCodeCar] = useState(vehicle.codeCar ?? "");
  const [hourlyRate, setHourlyRate] = useState(
    vehicle.hourlyRateSr != null ? String(vehicle.hourlyRateSr) : "",
  );
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
    if (!displayNameEn.trim() || !displayNameAr.trim()) {
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
        codeCar: codeCar.trim() || null,
      };
      const sr = hourlyRate.trim();
      if (sr) {
        const parsed = Number(sr);
        if (!Number.isFinite(parsed)) {
          setError(t("error"));
          return;
        }
        metadata.sr = parsed;
      } else {
        metadata.sr = null;
      }

      const res = await apiFetch(
        `/api/vehicle-catalog/${encodeURIComponent(vehicle.id)}/update_metadata`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken: vehicle.id,
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
      onUpdated?.();
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const stateLabel = presentStatus(
    vehicle.activeStatus,
    locale === "ar" ? "ar" : "en",
  );

  return (
    <section
      data-testid="vehicle-catalog-metadata-panel"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-slate-900">
        {t("submitAction")}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
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
      <div className="mt-3">
        <button
          type="button"
          className={adminUi.btnPrimary}
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          {t("submitAction")}
        </button>
      </div>
      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="vehicle-catalog-update-metadata"
          confirmTemplateKey="confirmAgentWrite"
          actionLabelKey="submitAction"
          targetId={vehicle.id}
          stateLabel={stateLabel}
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
    </section>
  );
}
