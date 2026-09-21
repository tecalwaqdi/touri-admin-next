"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";
import type { Agent } from "@/types/agent";

type Option = { id: string; label: string };

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function dateInputToIso(date: string): string | null {
  const d = date.trim();
  if (!d) return null;
  return `${d}T00:00:00.000Z`;
}

/**
 * Agent metadata edit — legacy parity (display name, phone, country, contract dates).
 * Commission / finance docs remain read-only (Finance hard constraint).
 */
export function AgentEditPanel({
  agent,
  onUpdated,
}: {
  agent: Agent;
  onUpdated: (next: Agent) => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(agent.name);
  const [phone, setPhone] = useState(agent.phone ?? "");
  const [countryId, setCountryId] = useState(agent.countryId);
  const [activeFrom, setActiveFrom] = useState(isoToDateInput(agent.activeFromUtc));
  const [activeTo, setActiveTo] = useState(isoToDateInput(agent.activeToUtc));
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

  const countryChanged =
    countryId.trim() !== "" && countryId.trim() !== agent.countryId;

  if (!canWrite || !isControlledWriteChromeEnabled()) return null;

  const resetForm = () => {
    setDisplayName(agent.name);
    setPhone(agent.phone ?? "");
    setCountryId(agent.countryId);
    setActiveFrom(isoToDateInput(agent.activeFromUtc));
    setActiveTo(isoToDateInput(agent.activeToUtc));
  };

  const run = async () => {
    if (inFlight.current) return;
    if (!displayName.trim() || !countryId.trim()) {
      setError(t("error"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const body: Record<string, unknown> = {
        expectedCurrentState: agent.status,
        displayName: displayName.trim(),
        countryId: countryId.trim(),
        phone: phone.trim() || null,
        activeFromUtc: dateInputToIso(activeFrom),
        activeToUtc: dateInputToIso(activeTo),
      };
      const res = await apiFetch(
        `/api/agents/${encodeURIComponent(agent.id)}/update_metadata`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "idempotency-key": `agent-edit-${agent.id}-${Date.now()}`,
          },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => ({}))) as Agent & {
        error?: string;
        code?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(json.message ?? json.error ?? json.code ?? t("error"));
        return;
      }
      onUpdated(json);
      setSuccess(t("writeApplied"));
      setConfirming(false);
      setOpen(false);
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <section
      data-testid="agent-edit"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {t("agentEditAction")}
        </h3>
        {!open ? (
          <button
            type="button"
            className={adminUi.btnSecondary}
            data-testid="agent-edit-open"
            onClick={() => {
              resetForm();
              setOpen(true);
              setError(undefined);
              setSuccess(undefined);
            }}
          >
            {t("agentEditAction")}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">
              {t("displayName")} <span className="text-rose-600">*</span>
            </span>
            <input
              className={adminUi.filterControl}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t("agentPhone")}</span>
            <input
              className={adminUi.filterControl}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="agent-edit-phone"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">
              {t("country")} <span className="text-rose-600">*</span>
            </span>
            <select
              className={adminUi.filterControl}
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
              data-testid="agent-edit-country"
            >
              <option value="">{t("selectCountry")}</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {countryChanged ? (
            <p className={adminUi.caption} data-testid="agent-country-change-hint">
              {t("agentCountryChangeHint")}
            </p>
          ) : (
            <p className={adminUi.caption}>{t("oneCountryOneAgentHint")}</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
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
              testIdPrefix="agent-edit"
              confirmTemplateKey="confirmAgentWrite"
              actionLabelKey="agentEditAction"
              targetId={agent.id}
              stateLabel={agent.status}
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
