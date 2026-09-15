"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";

type SodAction = {
  api: "submit" | "approve" | "reject" | "close" | "reverse";
  label: MessageKey;
  permission:
    | "settlements:create"
    | "settlements:approve"
    | "settlements:execute"
    | "settlements:reverse";
};

const ACTIONS: SodAction[] = [
  { api: "submit", label: "submitAction", permission: "settlements:create" },
  { api: "approve", label: "approveAction", permission: "settlements:approve" },
  { api: "reject", label: "rejectAction", permission: "settlements:approve" },
  { api: "close", label: "closeAction", permission: "settlements:execute" },
  { api: "reverse", label: "reverseAction", permission: "settlements:reverse" },
];

/**
 * Finance SoD action chrome — gated by NEXT_PUBLIC_CONTROLLED_WRITES_UI.
 * Server gates remain authoritative. No React money calculation.
 */
export function SettlementWriteActions({
  settlementId,
  currentStatus,
  onDone,
}: {
  settlementId: string;
  currentStatus: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState<SodAction | null>(null);
  const inFlight = useRef(false);

  const visible = isControlledWriteChromeEnabled();
  const allowed = useMemo(() => {
    if (!session?.user) return [];
    return ACTIONS.filter((a) =>
      hasPermission(session.user!.permissions, a.permission),
    );
  }, [session]);

  if (!visible || allowed.length === 0) return null;

  const run = async (action: SodAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(action.api);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(`/api/settlements/${settlementId}/${action.api}`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          expectedCurrentState: currentStatus,
          reasonCode: "operational",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? body.code ?? t("error"));
      }
      setSuccess(t("writeApplied"));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setPending(null);
      setConfirming(null);
      inFlight.current = false;
    }
  };

  return (
    <div data-testid="settlement-write-actions" className="space-y-3">
      <h3 className="text-sm font-semibold">{t("financeControlledActions")}</h3>
      <div className="flex flex-wrap gap-2">
        {allowed.map((a) => (
          <button
            key={a.api}
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            disabled={!!pending}
            onClick={() => setConfirming(a)}
          >
            {t(a.label)}
          </button>
        ))}
      </div>
      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="settlement-write"
          confirmTemplateKey="confirmSettlementWrite"
          actionLabelKey={confirming.label}
          targetId={settlementId}
          stateLabel={currentStatus}
          pending={pending === confirming.api}
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
    </div>
  );
}
