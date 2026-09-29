"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";

type Option = { id: string; label: string };

/**
 * Fleet / transport_company create — full company fields + panel login password
 * so the company can sign in as transport_manager and manage its drivers.
 */
export function FleetCreatePanel({
  onCreated,
}: {
  onCreated?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [countryId, setCountryId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
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

  const resetForm = () => {
    setResourceId("");
    setDisplayName("");
    setLicenseNumber("");
    setCountryId("");
    setPhone("");
    setEmail("");
    setPassword("");
    setPasswordConfirm("");
  };

  const run = async () => {
    if (inFlight.current) return;
    const id = resourceId.trim();
    if (
      !id ||
      !displayName.trim() ||
      !licenseNumber.trim() ||
      !countryId.trim() ||
      !phone.trim() ||
      !email.trim() ||
      !password.trim()
    ) {
      setError(t("fleetCreateFieldsRequired"));
      return;
    }
    if (password !== passwordConfirm) {
      setError(t("fleetPasswordMismatch"));
      return;
    }
    if (password.trim().length < 6) {
      setError(t("fleetPasswordTooShort"));
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
        countryId: countryId.trim(),
        phone: phone.trim(),
        email: email.trim(),
      };
      if (country?.label) metadata.countryText = country.label;

      const res = await apiFetch(
        `/api/fleet/${encodeURIComponent(id)}/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken: "create",
            reasonCode: "operational",
            metadata,
            loginPassword: password.trim(),
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        error?: string;
        login?: { ok?: boolean; message?: string; email?: string };
      };
      if (!res.ok || json.ok === false) {
        setError(json.message ?? json.error ?? json.code ?? t("error"));
        return;
      }
      if (json.login && json.login.ok === false) {
        setError(
          json.login.message ??
            t("fleetLoginProvisionPartial"),
        );
      } else {
        setSuccess(
          json.login?.email
            ? t("fleetCreateWithLoginSuccess")
            : t("writeApplied"),
        );
      }
      setConfirming(false);
      setOpen(false);
      resetForm();
      onCreated?.(id);
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div data-testid="fleet-create" className="mb-3">
      {!open ? (
        <button
          type="button"
          className={adminUi.btnPrimary}
          onClick={() => setOpen(true)}
        >
          {t("fleetCreateAction")}
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className={`mb-3 ${adminUi.caption}`}>{t("fleetCreateLoginHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("id")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("name")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("licenseNumber")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("country")} <span className="text-rose-600">*</span>
              </span>
              <select
                className={adminUi.filterControl}
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                required
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
              <span className="mb-1 block text-slate-600">
                {t("phone")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("email")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("password")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                data-testid="fleet-create-password"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("confirmPassword")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
                data-testid="fleet-create-password-confirm"
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
              {t("fleetCreateAction")}
            </button>
            <button
              type="button"
              className={adminUi.btnGhost}
              disabled={pending}
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              {t("cancel")}
            </button>
          </div>
          {confirming ? (
            <ControlledWriteConfirmPanel
              testIdPrefix="fleet-create"
              confirmTemplateKey="confirmAgentWrite"
              actionLabelKey="fleetCreateAction"
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
