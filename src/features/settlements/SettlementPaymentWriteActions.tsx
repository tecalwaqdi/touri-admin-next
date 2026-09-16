"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";

/**
 * FR5 payment depth chrome — create/confirm/reverse.
 * Amount entered as minor units string from operator; no React money calc.
 * Outstanding/paid display comes from server response only.
 */
export function SettlementPaymentWriteActions({
  settlementId,
  payments,
  onDone,
}: {
  settlementId: string;
  payments: Array<{ id: string; status: string; amountMinor: string | number | null }>;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [amountMinor, setAmountMinor] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState<
    | { kind: "create" }
    | { kind: "confirm" | "reverse"; paymentId: string }
    | null
  >(null);
  const [serverOutstanding, setServerOutstanding] = useState<string | null>(null);
  const inFlight = useRef(false);

  const visible = isControlledWriteChromeEnabled();
  const canExecute = useMemo(
    () =>
      session?.user
        ? hasPermission(session.user.permissions, "settlements:execute")
        : false,
    [session],
  );
  const canReverse = useMemo(
    () =>
      session?.user
        ? hasPermission(session.user.permissions, "settlements:reverse")
        : false,
    [session],
  );

  if (!visible || (!canExecute && !canReverse)) return null;

  const run = async () => {
    if (!confirming || inFlight.current) return;
    inFlight.current = true;
    setPending(confirming.kind);
    setError(undefined);
    setSuccess(undefined);
    try {
      let res: Response;
      if (confirming.kind === "create") {
        res = await apiFetch(`/api/settlements/${settlementId}/payments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({ amountMinor: amountMinor.trim() }),
        });
      } else {
        res = await apiFetch(
          `/api/settlements/${settlementId}/payments/${confirming.paymentId}/${confirming.kind}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "idempotency-key": crypto.randomUUID(),
            },
            body: JSON.stringify({ reason: "operational" }),
          },
        );
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        message?: string;
        outstandingMinor?: string;
        ok?: boolean;
      };
      if (!res.ok || body.ok === false) {
        throw new Error(body.message ?? body.error ?? body.code ?? t("error"));
      }
      if (body.outstandingMinor != null) {
        setServerOutstanding(body.outstandingMinor);
      }
      setSuccess(t("writeApplied"));
      setAmountMinor("");
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
    <div data-testid="settlement-payment-write-actions" className="space-y-3">
      <h3 className="text-sm font-semibold">Settlement payments (FR5)</h3>
      {serverOutstanding != null ? (
        <p className="text-sm text-slate-600" data-testid="payment-outstanding-server">
          Outstanding (server): {serverOutstanding}
        </p>
      ) : null}
      {canExecute ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">amountMinor</span>
            <input
              className="rounded border px-2 py-1.5 text-sm"
              value={amountMinor}
              onChange={(e) => setAmountMinor(e.target.value)}
              inputMode="numeric"
              data-testid="payment-amount-minor"
            />
          </label>
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            disabled={!!pending || !amountMinor.trim()}
            onClick={() => setConfirming({ kind: "create" })}
          >
            Create payment
          </button>
        </div>
      ) : null}
      <ul className="space-y-2 text-sm">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2">
            <span>
              {p.id} · {p.status} · {String(p.amountMinor ?? "—")}
            </span>
            {canExecute && p.status === "pending" ? (
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                disabled={!!pending}
                onClick={() =>
                  setConfirming({ kind: "confirm", paymentId: p.id })
                }
              >
                Confirm
              </button>
            ) : null}
            {canReverse && p.status === "confirmed" ? (
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                disabled={!!pending}
                onClick={() =>
                  setConfirming({ kind: "reverse", paymentId: p.id })
                }
              >
                Reverse
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="settlement-payment"
          confirmTemplateKey="confirmSettlementWrite"
          actionLabelKey="submitAction"
          targetId={
            confirming.kind === "create" ? settlementId : confirming.paymentId
          }
          stateLabel={confirming.kind}
          pending={pending === confirming.kind}
          onConfirm={() => void run()}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
    </div>
  );
}
