"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";
import { presentStatus } from "@/domain/presentation/statusPresentation";

type Option = { id: string; label: string };

type FleetEditFields = {
  id: string;
  displayName: string | null;
  licenseNumber: string | null;
  countryId: string | null;
  phone?: string | null;
  email?: string | null;
  activeStatus: string;
};

/**
 * Gated fleet metadata edit — update_metadata via fleet P0 route.
 */
export function FleetEditPanel({
  fleet,
  onUpdated,
}: {
  fleet: FleetEditFields;
  onUpdated?: () => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(fleet.displayName ?? "");
  const [licenseNumber, setLicenseNumber] = useState(
    fleet.licenseNumber ?? "",
  );
  const [countryId, setCountryId] = useState(fleet.countryId ?? "");
  const [phone, setPhone] = useState(fleet.phone ?? "");
  const [email, setEmail] = useState(fleet.email ?? "");
  const [countries, setCountries] = useState<Option[]>([]);
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

  const loadCountries = useCallback(async () => {
    const res = await apiFetch("/api/geography/countries?limit=50");
    if (!res.ok) return;
    const json = (await res.json()) as {
      items?: Array<{
        countryId: string;
        displayName?: string | null;
        displayNameEn?: string | null;
        displayNameAr?: string | null;
      }>;
    };
    setCountries(
      (json.items ?? []).map((c) => ({
        id: c.countryId,
        label:
          (locale === "ar"
            ? c.displayNameAr ?? c.displayName
            : c.displayNameEn ?? c.displayName) || c.countryId,
      })),
    );
  }, [apiFetch, locale]);

  useEffect(() => {
    if (!open || !canWrite) return;
    void loadCountries();
  }, [open, canWrite, loadCountries]);

  if (!canWrite || !isControlledWriteChromeEnabled()) return null;

  const run = async () => {
    if (inFlight.current) return;
    if (!displayName.trim() || !licenseNumber.trim()) {
      setError(t("error"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const country = countries.find((c) => c.id === countryId);
      const metadata: Record<string, string | number | boolean | null> = {
        displayName: displayName.trim(),
        licenseNumber: licenseNumber.trim(),
      };
      if (countryId.trim()) {
        metadata.countryId = countryId.trim();
        if (country?.label) metadata.countryText = country.label;
      }
      if (phone.trim()) metadata.phone = phone.trim();
      if (email.trim()) metadata.email = email.trim();

      const res = await apiFetch(
        `/api/fleet/${encodeURIComponent(fleet.id)}/update_metadata`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken: fleet.id,
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
      onUpdated?.();
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div data-testid="fleet-edit" className="mb-3">
      {!open ? (
        <button
          type="button"
          className={adminUi.btnGhost}
          onClick={() => setOpen(true)}
        >
          {t("fleetEditAction")}
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("name")}</span>
              <input
                className={adminUi.filterControl}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("licenseNumber")}
              </span>
              <input
                className={adminUi.filterControl}
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("country")}</span>
              <select
                className={adminUi.filterControl}
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
              >
                <option value="">—</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("phone")}</span>
              <input
                className={adminUi.filterControl}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("email")}</span>
              <input
                className={adminUi.filterControl}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {t("fleetEditAction")}
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
              testIdPrefix="fleet-edit"
              confirmTemplateKey="confirmAgentWrite"
              actionLabelKey="fleetEditAction"
              targetId={fleet.displayName ?? fleet.id}
              stateLabel={presentStatus(
                fleet.activeStatus,
                locale === "ar" ? "ar" : "en",
              )}
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
