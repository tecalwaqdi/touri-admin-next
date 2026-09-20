"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { presentStatus } from "@/domain/presentation/statusPresentation";

type LifecycleAction = "activate" | "deactivate" | "archive";

type UiAction = {
  kind: LifecycleAction;
  label: MessageKey;
  api: LifecycleAction;
};

export function VehicleCatalogWriteActions({
  resourceId,
  activeStatus,
  preconditionToken,
  displayLabel,
  inline = false,
  onUpdated,
}: {
  resourceId: string;
  activeStatus: string;
  preconditionToken: string;
  displayLabel?: string;
  inline?: boolean;
  onUpdated?: () => void;
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
        ? hasPermission(session.user.permissions, "agents:manage")
        : false,
    [session.user],
  );

  const actions = useMemo((): UiAction[] => {
    const out: UiAction[] = [];
    if (activeStatus !== "active") {
      out.push({
        kind: "activate",
        label: "activateAction",
        api: "activate",
      });
    }
    if (activeStatus !== "inactive") {
      out.push({
        kind: "deactivate",
        label: "deactivateAction",
        api: "deactivate",
      });
    }
    out.push({
      kind: "archive",
      label: "geographyArchiveAction",
      api: "archive",
    });
    return out;
  }, [activeStatus]);

  if (!canWrite || actions.length === 0) return null;
  if (!isControlledWriteChromeEnabled()) return null;

  const stateLabel = presentStatus(activeStatus, locale === "ar" ? "ar" : "en");
  const targetLabel = displayLabel ?? resourceId;

  const run = async (action: UiAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(action.kind);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(
        `/api/vehicle-catalog/${encodeURIComponent(resourceId)}/${action.api}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken,
            reasonCode: "operational",
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
      setSuccess(inline ? undefined : t("writeApplied"));
      setConfirming(null);
      onUpdated?.();
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  const buttonClass = inline
    ? "rounded border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
    : "rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50";

  const body = (
    <>
      <div className="flex flex-wrap gap-1">
        {actions.map((action) => (
          <button
            key={action.kind}
            type="button"
            data-testid={`vehicle-catalog-write-${action.kind}${inline ? `-inline-${resourceId}` : ""}`}
            className={buttonClass}
            disabled={pending != null}
            onClick={() => setConfirming(action)}
          >
            {t(action.label)}
          </button>
        ))}
      </div>
      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix={`vehicle-catalog-${confirming.kind}`}
          confirmTemplateKey="confirmAgentWrite"
          actionLabelKey={confirming.label}
          targetId={targetLabel}
          stateLabel={stateLabel}
          pending={pending === confirming.kind}
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {!inline && success ? (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          {success}
        </p>
      ) : null}
    </>
  );

  if (inline) {
    return (
      <div data-testid={`vehicle-catalog-write-inline-${resourceId}`}>
        {body}
      </div>
    );
  }

  return (
    <section
      data-testid="vehicle-catalog-write-actions"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-slate-900">
        {t("agentActionsTitle")}
      </h3>
      {body}
    </section>
  );
}
