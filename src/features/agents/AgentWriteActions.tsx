"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import type { Agent, AgentStatus } from "@/types/agent";
import { allowedFromStatesForAgentAction } from "@/application/controlled-writes/agents/AgentStateMachine";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

type UiAction =
  | { kind: "activate"; label: string; api: "activate" }
  | { kind: "reactivate"; label: string; api: "activate" }
  | { kind: "deactivate"; label: string; api: "deactivate"; needsReason: true }
  | { kind: "suspend"; label: string; api: "suspend"; needsReason: true };

function legalActions(status: AgentStatus): UiAction[] {
  const out: UiAction[] = [];
  if (allowedFromStatesForAgentAction("activate").includes(status)) {
    if (status === "suspended") {
      out.push({ kind: "reactivate", label: "reactivateAction" as MessageKey, api: "activate" });
    } else {
      out.push({ kind: "activate", label: "activateAction" as MessageKey, api: "activate" });
    }
  }
  if (allowedFromStatesForAgentAction("deactivate").includes(status)) {
    out.push({
      kind: "deactivate",
      label: "deactivateAction" as MessageKey,
      api: "deactivate",
      needsReason: true,
    });
  }
  if (allowedFromStatesForAgentAction("suspend").includes(status)) {
    out.push({
      kind: "suspend",
      label: "suspendAction" as MessageKey,
      api: "suspend",
      needsReason: true,
    });
  }
  return out;
}

const DEFAULT_REASON: Record<string, string> = {
  deactivate: "operational",
  suspend: "operational",
};

export function AgentWriteActions({
  agent,
  onUpdated,
}: {
  agent: Agent;
  onUpdated: (next: Agent) => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState<UiAction | null>(null);
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "agents:manage")
        : false,
    [session.user],
  );

  const actions = useMemo(() => legalActions(agent.status), [agent.status]);

  if (!canWrite || actions.length === 0) return null;
  if (!isControlledWriteChromeEnabled()) return null;

  const run = async (action: UiAction) => {
    if (inFlight.current || pending) return;
    inFlight.current = true;
    setPending(action.kind);
    setError(undefined);
    setSuccess(undefined);
    try {
      const body: Record<string, string> = {
        expectedCurrentState: agent.status,
      };
      if ("needsReason" in action && action.needsReason) {
        body.reasonCode = DEFAULT_REASON[action.api] ?? "other";
      }
      const res = await apiFetch(`/api/agents/${agent.id}/${action.api}`, {
        method: "POST",
        headers: {
          "idempotency-key": `ui-${action.kind}-${agent.id}-${Date.now()}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Agent & {
        error?: string;
        code?: string;
        write?: { toState?: string };
      };
      if (!res.ok) {
        setError(
          [json.code, json.error].filter(Boolean).join(": ") ||
            `Action ${action.label} failed`,
        );
        return;
      }
      onUpdated(json);
      setSuccess(`${action.label} applied → ${json.write?.toState ?? json.status}`);
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("requestFailed"));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  return (
    <div
      data-testid="agent-write-actions"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="mb-3 font-semibold">Agent actions</h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.kind}
            type="button"
            data-testid={`agent-action-${action.kind}`}
            disabled={Boolean(pending)}
            className={
              action.kind === "activate" || action.kind === "reactivate"
                ? "rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                : "rounded bg-rose-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            }
            onClick={() => setConfirming(action)}
          >
            {pending === action.kind ? t("working") : t(action.label as MessageKey)}
          </button>
        ))}
      </div>

      {confirming ? (
        <div
          data-testid="agent-action-confirm"
          className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm"
        >
          <p>
            {t("confirm")} <strong>{t(confirming.label as MessageKey)}</strong> for agent{" "}
            <span className="font-mono">{agent.id}</span> (state {agent.status})?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-testid="agent-action-confirm-yes"
              disabled={Boolean(pending)}
              className="rounded bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50"
              onClick={() => void run(confirming)}
            >
              {pending ? t("working") : t("confirm")}
            </button>
            <button
              type="button"
              data-testid="agent-action-confirm-no"
              disabled={Boolean(pending)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50"
              onClick={() => setConfirming(null)}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p data-testid="agent-action-error" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p data-testid="agent-action-success" className="mt-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}
    </div>
  );
}
