"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import type { Customer } from "@/types/common";
import { allowedFromStatesForCustomerAction } from "@/application/controlled-writes/customers/CustomerStateMachine";
import type { ProvenCustomerOperationalState } from "@/application/controlled-writes/customers/CustomerWriteTypes";
import {
  customerStatusToOperational,
} from "@/application/controlled-writes/runtime/CustomerAdminWriteBridge";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";

type UiAction =
  | { kind: "disable"; label: MessageKey; api: "disable"; needsReason: true }
  | { kind: "block"; label: MessageKey; api: "block"; needsReason: true }
  | { kind: "reactivate"; label: MessageKey; api: "reactivate" }
  | { kind: "enable"; label: MessageKey; api: "reactivate" };

function legalActions(status: Customer["status"]): UiAction[] {
  const operational = customerStatusToOperational(status);
  const out: UiAction[] = [];
  if (allowedFromStatesForCustomerAction("disable").includes(operational)) {
    out.push({
      kind: "disable",
      label: "disableAction",
      api: "disable",
      needsReason: true,
    });
  }
  if (allowedFromStatesForCustomerAction("block").includes(operational)) {
    out.push({
      kind: "block",
      label: "blockAction",
      api: "block",
      needsReason: true,
    });
  }
  if (allowedFromStatesForCustomerAction("reactivate").includes(operational)) {
    if (status === "inactive") {
      out.push({ kind: "enable", label: "enableAction", api: "reactivate" });
    } else {
      out.push({ kind: "reactivate", label: "reactivateAction", api: "reactivate" });
    }
  }
  return out;
}

const DEFAULT_REASON: Record<string, string> = {
  disable: "operational",
  block: "policy_violation",
  reactivate: "operational",
};

export function CustomerWriteActions({
  customer,
  onUpdated,
}: {
  customer: Customer;
  onUpdated: (next: Customer) => void;
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
        ? hasPermission(session.user.permissions, "customers:manage")
        : false,
    [session.user],
  );

  const actions = useMemo(
    () => legalActions(customer.status),
    [customer.status],
  );

  if (!canWrite) return null;
  if (!isControlledWriteChromeEnabled()) return null;

  if (actions.length === 0) {
    return (
      <div
        data-testid="customer-write-actions"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="mb-2 font-semibold">{t("customerActionsTitle")}</h2>
        <p
          data-testid="customer-actions-unavailable"
          className="text-sm text-slate-600"
        >
          {t("customerActionsUnavailable")}
        </p>
        <p className="mt-1 text-xs text-slate-500">{t("customerActionsHint")}</p>
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
      const expectedCurrentState: ProvenCustomerOperationalState =
        customerStatusToOperational(customer.status);
      const body: Record<string, string> = { expectedCurrentState };
      if ("needsReason" in action && action.needsReason) {
        body.reasonCode = DEFAULT_REASON[action.api] ?? "other";
      } else if (action.api === "reactivate") {
        body.reasonCode = DEFAULT_REASON.reactivate;
      }
      const res = await apiFetch(`/api/customers/${customer.id}/${action.api}`, {
        method: "POST",
        headers: {
          "idempotency-key": `ui-${action.kind}-${customer.id}-${Date.now()}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Customer & {
        error?: string;
        code?: string;
        write?: { toState?: string; authWriteExecuted?: boolean };
      };
      if (!res.ok) {
        setError(
          [json.code, json.error].filter(Boolean).join(": ") ||
            `Action ${action.label} failed`,
        );
        return;
      }
      onUpdated(json);
      setSuccess(
        `${t("writeApplied")} → ${json.write?.toState ?? json.status}`,
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
      data-testid="customer-write-actions"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="mb-3 font-semibold">{t("customerActionsTitle")}</h2>
      <p className="mb-2 text-xs text-slate-500">{t("customerActionsHint")}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.kind}
            type="button"
            data-testid={`customer-action-${action.kind}`}
            disabled={Boolean(pending)}
            className={
              action.kind === "reactivate" || action.kind === "enable"
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
          testIdPrefix="customer-action"
          confirmTemplateKey="confirmCustomerWrite"
          actionLabelKey={confirming.label}
          targetId={customer.id}
          stateLabel={customer.status}
          pending={Boolean(pending)}
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {error ? (
        <p
          data-testid="customer-action-error"
          className="mt-2 text-sm text-rose-700"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          data-testid="customer-action-success"
          className="mt-2 text-sm text-emerald-700"
        >
          {success}
        </p>
      ) : null}
    </div>
  );
}
