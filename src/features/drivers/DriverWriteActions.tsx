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
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { presentStatus } from "@/domain/presentation/statusPresentation";

type UiAction =
  | { kind: "approve"; label: MessageKey; api: "approve" }
  | { kind: "reactivate"; label: MessageKey; api: "approve" }
  | { kind: "reject"; label: MessageKey; api: "reject"; needsReason: true }
  | { kind: "needs_changes"; label: MessageKey; api: "needs_changes"; needsReason: true }
  | { kind: "suspend"; label: MessageKey; api: "suspend"; needsReason: true };

function legalActions(status: RegistrationStatus): UiAction[] {
  const out: UiAction[] = [];
  if (allowedFromStatesForAction("approve").includes(status)) {
    if (status === "suspended") {
      out.push({ kind: "reactivate", label: "reactivateAction", api: "approve" });
    } else {
      out.push({ kind: "approve", label: "approveAction", api: "approve" });
    }
  }
  if (allowedFromStatesForAction("reject").includes(status)) {
    out.push({
      kind: "reject",
      label: "rejectAction",
      api: "reject",
      needsReason: true,
    });
  }
  if (allowedFromStatesForAction("needs_changes").includes(status)) {
    out.push({
      kind: "needs_changes",
      label: "requestChangesAction",
      api: "needs_changes",
      needsReason: true,
    });
  }
  if (allowedFromStatesForAction("suspend").includes(status)) {
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
  const { t, locale } = useI18n();
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

  if (!isControlledWriteChromeEnabled()) return null;
  if (!canWrite) return null;

  if (actions.length === 0) {
    const emptyMessage =
      driver.registrationStatus === "draft"
        ? t("driverActionsUnavailableDraft")
        : t("driverActionsUnavailable");
    return (
      <div
        data-testid="driver-write-actions"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="mb-2 font-semibold">{t("driverActionsTitle")}</h2>
        <p
          data-testid="driver-actions-empty"
          className="text-sm text-slate-600"
        >
          {emptyMessage}
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
      const toState = json.write?.toState ?? json.registrationStatus;
      setSuccess(
        `${t("writeApplied")} → ${presentStatus(toState, locale)}`,
      );
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
      <h2 className="mb-3 font-semibold">{t("driverActionsTitle")}</h2>
      <p className="mb-2 text-xs text-slate-500">
        {driver.registrationStatus === "pending_review"
          ? `${t("approveAction")} / ${t("rejectAction")} / ${t("requestChangesAction")}`
          : driver.registrationStatus === "suspended"
            ? t("reactivateAction")
            : driver.registrationStatus === "approved"
              ? t("suspendAction")
              : null}
      </p>
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
            {pending === action.kind ? t("working") : t(action.label)}
          </button>
        ))}
      </div>

      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="driver-action"
          confirmTemplateKey="confirmDriverWrite"
          actionLabelKey={confirming.label}
          targetId={driver.id}
          stateLabel={presentStatus(driver.registrationStatus, locale)}
          pending={Boolean(pending)}
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
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
