"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";
import type { Agent } from "@/types/agent";

/**
 * Agent metadata edit — display name only (country reassignment forbidden).
 * Commission / phone / email / docs are intentionally not writable here.
 */
export function AgentEditPanel({
  agent,
  onUpdated,
}: {
  agent: Agent;
  onUpdated: (next: Agent) => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(agent.name);
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
    if (!displayName.trim()) {
      setError(t("error"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(`/api/agents/${encodeURIComponent(agent.id)}/update_metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": `agent-edit-${agent.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          expectedCurrentState: agent.status,
          displayName: displayName.trim(),
        }),
      });
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
              setDisplayName(agent.name);
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
          <p className={adminUi.caption}>
            {t("oneCountryOneAgentHint")} — {t("country")}:{" "}
            <span className="font-mono">{agent.countryId || "—"}</span>
          </p>
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
