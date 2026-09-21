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
 * Agent create — Fake/offline when chrome + development synthetic.
 * Production Auth+user provision remains separately gated (no UI→Firestore).
 * Create-as-active enforces one-country-one-active server-side.
 */
export function AgentCreatePanel({ onCreated }: { onCreated?: (id: string) => void }) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [status, setStatus] = useState<"inactive" | "active">("inactive");
  const [phone, setPhone] = useState("");
  const [activeFrom, setActiveFrom] = useState("");
  const [activeTo, setActiveTo] = useState("");
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
    if (open && canWrite) void loadCountries();
  }, [open, canWrite, loadCountries]);

  if (!canWrite || !isControlledWriteChromeEnabled()) return null;

  const dateInputToIso = (date: string): string | null => {
    const d = date.trim();
    if (!d) return null;
    return `${d}T00:00:00.000Z`;
  };

  const run = async () => {
    if (inFlight.current) return;
    const id = agentId.trim();
    if (!id || !displayName.trim() || !countryId.trim()) {
      setError(t("error"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch("/api/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": `agent-create-${id}-${Date.now()}`,
        },
        body: JSON.stringify({
          agentId: id,
          displayName: displayName.trim(),
          countryId: countryId.trim(),
          status,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(activeFrom.trim()
            ? { activeFromUtc: dateInputToIso(activeFrom) }
            : {}),
          ...(activeTo.trim() ? { activeToUtc: dateInputToIso(activeTo) } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        error?: string;
        id?: string;
      };
      if (!res.ok) {
        setError(json.message ?? json.error ?? json.code ?? t("error"));
        return;
      }
      setSuccess(t("writeApplied"));
      setConfirming(false);
      setOpen(false);
      onCreated?.(json.id ?? id);
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div data-testid="agent-create" className="mb-3">
      {!open ? (
        <button
          type="button"
          className={adminUi.btnPrimary}
          data-testid="agent-create-open"
          onClick={() => setOpen(true)}
        >
          {t("agentCreateAction")}
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className={`mb-3 ${adminUi.caption}`}>{t("oneCountryOneAgentHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("id")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("displayName")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
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
              >
                <option value="">{t("selectCountry")}</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("status")}</span>
              <select
                className={adminUi.filterControl}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value === "active" ? "active" : "inactive")
                }
              >
                <option value="inactive">{t("deactivateAction")}</option>
                <option value="active">{t("activateAction")}</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("agentPhone")}</span>
              <input
                className={adminUi.filterControl}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("activeFrom")}</span>
              <input
                type="date"
                className={adminUi.filterControl}
                value={activeFrom}
                onChange={(e) => setActiveFrom(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("activeTo")}</span>
              <input
                type="date"
                className={adminUi.filterControl}
                value={activeTo}
                onChange={(e) => setActiveTo(e.target.value)}
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
              {t("agentCreateAction")}
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
              testIdPrefix="agent-create"
              confirmTemplateKey="confirmAgentWrite"
              actionLabelKey="agentCreateAction"
              targetId={agentId.trim() || "—"}
              stateLabel={status}
              warningKey={
                status === "active" ? "confirmAgentActivateWarning" : undefined
              }
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
