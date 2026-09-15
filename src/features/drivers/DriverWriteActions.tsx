"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { allowedFromStatesForAction } from "@/application/controlled-writes/drivers/DriverStateMachine";
import type { Driver } from "@/types/driver";
import type { RegistrationStatus } from "@/types/driver";

type UiAction =
  | { kind: "approve"; label: string; api: "approve" }
  | { kind: "reactivate"; label: string; api: "approve" }
  | { kind: "reject"; label: string; api: "reject"; needsReason: true }
  | { kind: "needs_changes"; label: string; api: "needs_changes"; needsReason: true }
  | { kind: "suspend"; label: string; api: "suspend"; needsReason: true };

function legalActions(status: RegistrationStatus): UiAction[] {
  const out: UiAction[] = [];
  if (allowedFromStatesForAction("approve").includes(status)) {
    if (status === "suspended") {
      out.push({ kind: "reactivate", label: "reactivateAction" as MessageKey, api: "approve" });
    } else {
      out.push({ kind: "approve", label: "approveAction" as MessageKey, api: "approve" });
    }
  }
  if (allowedFromStatesForAction("reject").includes(status)) {
    out.push({
      kind: "reject",
      label: "rejectAction" as MessageKey,
      api: "reject",
      needsReason: true,
    });
  }
  if (allowedFromStatesForAction("needs_changes").includes(status)) {
    out.push({
      kind: "needs_changes",
      label: "requestChangesAction" as MessageKey,
      api: "needs_changes",
      needsReason: true,
    });
  }
  if (allowedFromStatesForAction("suspend").includes(status)) {
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
  reject: "missing_document",
  needs_changes: "missing_document",
  suspend: "operational",
};

export function DriverWriteActions({
  driver,
  onUpdated,
}: {
  driver: Driver;
  onUpdated: (next: Driver) => void;
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
        ? hasPermission(session.user.permissions, "drivers:approve")
        : false,
    [session.user],
  );

  const actions = useMemo(
    () => legalActions(driver.registrationStatus),
    [driver.registrationStatus],
  );

  if (!canWrite || actions.length === 0) return null;

  const run = async (action: UiAction) => {
    if (inFlight.current || pending) return;
    inFlight.current = true;
    setPending(action.kind);
    setError(undefined);
    setSuccess(undefined);
    try {
      const body: Record<string, string> = {
        expectedCurrentState: driver.registrationStatus,
      };
      if ("needsReason" in action && action.needsReason) {
        body.reasonCode = DEFAULT_REASON[action.api] ?? "other";
      }
      const res = await apiFetch(`/api/drivers/${driver.id}/${action.api}`, {
        method: "POST",
        headers: {
          "idempotency-key": `ui-${action.kind}-${driver.id}-${Date.now()}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Driver & {
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
      setSuccess(`${action.label} applied → ${json.write?.toState ?? json.registrationStatus}`);
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
      data-testid="driver-write-actions"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="mb-3 font-semibold">Driver actions</h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.kind}
            type="button"
            data-testid={`driver-action-${action.kind}`}
            disabled={Boolean(pending)}
            className={
              action.kind === "approve" || action.kind === "reactivate"
                ? "rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                : action.kind === "reject" || action.kind === "suspend"
                  ? "rounded bg-rose-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                  : "rounded bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            }
            onClick={() => setConfirming(action)}
          >
            {pending === action.kind ? t("working") : t(action.label as MessageKey)}
          </button>
        ))}
      </div>

      {confirming ? (
        <div
          data-testid="driver-action-confirm"
          className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm"
        >
          <p>
            {t("confirm")} <strong>{t(confirming.label as MessageKey)}</strong> for driver{" "}
            <span className="font-mono">{driver.id}</span> (state{" "}
            {driver.registrationStatus})?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-testid="driver-action-confirm-yes"
              disabled={Boolean(pending)}
              className="rounded bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50"
              onClick={() => void run(confirming)}
            >
              {pending ? t("working") : t("confirm")}
            </button>
            <button
              type="button"
              data-testid="driver-action-confirm-no"
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
        <p data-testid="driver-action-error" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p data-testid="driver-action-success" className="mt-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}
    </div>
  );
}
