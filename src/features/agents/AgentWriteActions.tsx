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
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";

type UiAction =
  | { kind: "activate"; label: MessageKey; api: "activate" }
  | { kind: "reactivate"; label: MessageKey; api: "activate" }
  | { kind: "deactivate"; label: MessageKey; api: "deactivate"; needsReason: true }
  | { kind: "suspend"; label: MessageKey; api: "suspend"; needsReason: true };

function legalActions(status: AgentStatus): UiAction[] {
  const out: UiAction[] = [];
  if (allowedFromStatesForAgentAction("activate").includes(status)) {
    if (status === "suspended") {
      out.push({ kind: "reactivate", label: "reactivateAction", api: "activate" });
    } else {
      out.push({ kind: "activate", label: "activateAction", api: "activate" });
    }
  }
  if (allowedFromStatesForAgentAction("deactivate").includes(status)) {
    out.push({
      kind: "deactivate",
      label: "deactivateAction",
      api: "deactivate",
      needsReason: true,
    });
  }
  if (allowedFromStatesForAgentAction("suspend").includes(status)) {
    out.push({
      kind: "suspend",
      label: "suspendAction",
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

function presentAgentWriteError(
  code: string | undefined,
  error: string | undefined,
  t: (key: MessageKey) => string,
): string {
  const combined = [code, error].filter(Boolean).join(": ");
  if (
    code === "SCOPE_DENIED" &&
    (error?.toLowerCase().includes("countryid") ||
      error?.toLowerCase().includes("country"))
  ) {
    return t("agentCountryMissing");
  }
  if (combined.toLowerCase().includes("countryid missing")) {
    return t("agentCountryMissing");
  }
  return combined || t("requestFailed");
}

export function AgentWriteActions({
  agent,
  onUpdated,
  countryMissing = false,
}: {
  agent: Agent;
  onUpdated: (next: Agent) => void;
  /** When true, block mutations and show a clear message instead of raw API errors. */
  countryMissing?: boolean;
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

  if (!canWrite) return null;
  if (!isControlledWriteChromeEnabled()) return null;

  if (countryMissing || !agent.countryId?.trim()) {
    return (
      <div
        data-testid="agent-write-actions"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4"
      >
        <h2 className="mb-2 font-semibold">{t("agentActionsTitle")}</h2>
        <p data-testid="agent-country-missing" className="text-sm text-amber-950">
          {t("agentCountryMissing")}
        </p>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div
        data-testid="agent-write-actions"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="mb-2 font-semibold">{t("agentActionsTitle")}</h2>
        <p
          data-testid="agent-actions-unavailable"
          className="text-sm text-slate-600"
        >
          {t("agentActionsUnavailable")}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {t("oneCountryOneAgentHint")}
        </p>
      </div>
    );
  }

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
        setError(presentAgentWriteError(json.code, json.error, t));
        return;
      }
      onUpdated(json);
      setSuccess(`${t("writeApplied")} → ${json.write?.toState ?? json.status}`);
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
      <h2 className="mb-3 font-semibold">{t("agentActionsTitle")}</h2>
      <p className="mb-3 text-xs text-slate-500">{t("oneCountryOneAgentHint")}</p>
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
            {pending === action.kind ? t("working") : t(action.label)}
          </button>
        ))}
      </div>

      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="agent-action"
          confirmTemplateKey="confirmAgentWrite"
          actionLabelKey={confirming.label}
          targetId={agent.id}
          stateLabel={agent.status}
          warningKey={
            confirming.api === "activate"
              ? "confirmAgentActivateWarning"
              : undefined
          }
          pending={Boolean(pending)}
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
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
