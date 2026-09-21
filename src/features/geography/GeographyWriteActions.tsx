"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";

type GeographyResource = "country" | "region" | "city" | "landmark";

type UiAction = {
  kind: "activate" | "deactivate" | "archive" | "hide" | "unhide";
  label: MessageKey;
  api: "activate" | "deactivate" | "archive" | "update_metadata";
  metadata?: { visibility: "hidden" | "public" };
};

/**
 * Lifecycle actions — Domain forbids hard delete; archive stands in for remove.
 * Hide uses update_metadata visibility. Surfaces only when CONTROLLED_WRITES_UI is armed.
 */
export function GeographyWriteActions({
  resource,
  resourceId,
  active,
  visibilityStatus,
  preconditionToken,
  onUpdated,
}: {
  resource: GeographyResource;
  resourceId: string;
  active: boolean | null;
  visibilityStatus?: string | null;
  preconditionToken: string;
  onUpdated?: () => void;
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
        ? hasPermission(session.user.permissions, "agents:manage") ||
          hasPermission(session.user.permissions, "users:manage")
        : false,
    [session.user],
  );

  const isHidden =
    visibilityStatus === "hidden" || visibilityStatus === "inactive_hidden";

  const actions = useMemo((): UiAction[] => {
    const out: UiAction[] = [];
    if (active !== true) {
      out.push({
        kind: "activate",
        label: "geographyActivateAction",
        api: "activate",
      });
    }
    if (active !== false) {
      out.push({
        kind: "deactivate",
        label: "geographyDeactivateAction",
        api: "deactivate",
      });
    }
    if (!isHidden) {
      out.push({
        kind: "hide",
        label: "geographyHideAction",
        api: "update_metadata",
        metadata: { visibility: "hidden" },
      });
    } else {
      out.push({
        kind: "unhide",
        label: "geographyUnhideAction",
        api: "update_metadata",
        metadata: { visibility: "public" },
      });
    }
    out.push({
      kind: "archive",
      label: "geographyArchiveAction",
      api: "archive",
    });
    return out;
  }, [active, isHidden]);

  if (!canWrite || actions.length === 0) return null;
  if (!isControlledWriteChromeEnabled()) return null;

  const run = async (action: UiAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(action.kind);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(
        `/api/geography/${resource}/${encodeURIComponent(resourceId)}/${action.api}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedActive: active,
            preconditionToken,
            reasonCode: "operational",
            ...(action.metadata ? { metadata: action.metadata } : {}),
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
      setSuccess(t("writeApplied"));
      setConfirming(null);
      onUpdated?.();
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  return (
    <section
      data-testid="geography-write-actions"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="mb-1 text-sm font-semibold text-slate-900">
        {t("geographyLifecycleActions")}
      </h3>
      <p className={`mb-3 ${adminUi.caption}`}>{t("geographyDeleteSemantics")}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.kind}
            type="button"
            data-testid={`geography-write-${action.kind}`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={pending != null}
            onClick={() => setConfirming(action)}
          >
            {t(action.label)}
          </button>
        ))}
      </div>
      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix={`geography-${resource}-${confirming.kind}`}
          confirmTemplateKey="confirmGeographyWrite"
          actionLabelKey={confirming.label}
          targetId={resourceId}
          stateLabel={active == null ? t("unknown") : String(active)}
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
      {success ? (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          {success}
        </p>
      ) : null}
    </section>
  );
}
