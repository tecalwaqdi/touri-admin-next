"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import type { SupportDisplayStatus } from "@/application/controlled-writes/support/SupportWriteTypes";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";

const STATUS_OPTIONS: SupportDisplayStatus[] = [
  "open",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
];

const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const;

type PendingAction =
  | { api: "change_status"; label: MessageKey; body: Record<string, unknown> }
  | { api: "assign"; label: MessageKey; body: Record<string, unknown> }
  | { api: "reassign"; label: MessageKey; body: Record<string, unknown> }
  | { api: "resolve"; label: MessageKey; body: Record<string, unknown> }
  | { api: "reopen"; label: MessageKey; body: Record<string, unknown> }
  | { api: "add_note"; label: MessageKey; body: Record<string, unknown> }
  | { api: "categorize"; label: MessageKey; body: Record<string, unknown> }
  | {
      api: "update_priority";
      label: MessageKey;
      body: Record<string, unknown>;
    };

export function SupportWriteActions({
  ticketId,
  preconditionToken,
  onDone,
}: {
  ticketId: string;
  preconditionToken: string;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingAction | null>(null);
  const [targetStatus, setTargetStatus] =
    useState<SupportDisplayStatus>("in_progress");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] =
    useState<(typeof PRIORITY_OPTIONS)[number]>("normal");
  const [reassignAdminId, setReassignAdminId] = useState("");
  const inFlight = useRef(false);

  const canWrite = Boolean(
    session.user &&
      (hasPermission(session.user.permissions, "customers:manage") ||
        hasPermission(session.user.permissions, "users:manage")),
  );

  if (!isControlledWriteChromeEnabled() || !canWrite) return null;

  const run = async (action: PendingAction) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/support/${encodeURIComponent(ticketId)}/${action.api}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            expectedPreconditionToken: preconditionToken,
            ...action.body,
          }),
        },
      );
      const json = (await res.json()) as {
        error?: string;
        code?: string;
        ok?: boolean;
      };
      if (!res.ok || json.ok === false) {
        setError(json.error ?? json.code ?? t("error"));
      } else {
        setMessage(t("writeApplied"));
        onDone?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
      setConfirming(null);
      inFlight.current = false;
    }
  };

  return (
    <div
      className="rounded border border-slate-200 bg-slate-50 p-3"
      data-testid="support-write-actions"
    >
      <h3 className="mb-1 text-sm font-semibold">{t("supportActionsTitle")}</h3>
      <p className="mb-3 text-xs text-slate-500">{t("supportWriteGateHint")}</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          className="rounded border px-2 py-1 text-sm"
          value={targetStatus}
          onChange={(e) =>
            setTargetStatus(e.target.value as SupportDisplayStatus)
          }
          disabled={busy}
          aria-label={t("status")}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            setConfirming({
              api: "change_status",
              label: "changeStatusAction",
              body: { targetStatus },
            })
          }
        >
          {t("changeStatusAction")}
        </button>
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            setConfirming({
              api: "assign",
              label: "assignToMeAction",
              body: { assigneeAdminId: session.user?.id },
            })
          }
        >
          {t("assignToMeAction")}
        </button>
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            setConfirming({
              api: "resolve",
              label: "resolveAction",
              body: {},
            })
          }
        >
          {t("resolveAction")}
        </button>
        <button
          type="button"
          className="rounded bg-slate-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            setConfirming({
              api: "reopen",
              label: "reopenAction",
              body: {},
            })
          }
        >
          {t("reopenAction")}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
          placeholder={t("reassignAdminIdPlaceholder")}
          value={reassignAdminId}
          onChange={(e) => setReassignAdminId(e.target.value)}
          disabled={busy}
          aria-label={t("reassignAction")}
        />
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={busy || !reassignAdminId.trim()}
          onClick={() =>
            setConfirming({
              api: "reassign",
              label: "reassignAction",
              body: { assigneeAdminId: reassignAdminId.trim() },
            })
          }
        >
          {t("reassignAction")}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
          placeholder={t("category")}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={busy}
          aria-label={t("category")}
        />
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={busy || !category.trim()}
          onClick={() =>
            setConfirming({
              api: "categorize",
              label: "categorizeAction",
              body: { category: category.trim() },
            })
          }
        >
          {t("categorizeAction")}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className="rounded border px-2 py-1 text-sm"
          value={priority}
          onChange={(e) =>
            setPriority(e.target.value as (typeof PRIORITY_OPTIONS)[number])
          }
          disabled={busy}
          aria-label={t("priority")}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            setConfirming({
              api: "update_priority",
              label: "updatePriorityAction",
              body: { priority },
            })
          }
        >
          {t("updatePriorityAction")}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
          placeholder={t("internalNotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={busy || !note.trim()}
          onClick={() =>
            setConfirming({
              api: "add_note",
              label: "addNoteAction",
              body: { noteText: note },
            })
          }
        >
          {t("addNoteAction")}
        </button>
      </div>

      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="support-write"
          confirmTemplateKey="confirmSupportWrite"
          actionLabelKey={confirming.label}
          targetId={ticketId}
          stateLabel={targetStatus}
          pending={busy}
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-red-600" data-testid="support-write-msg">
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          className="mt-2 text-sm text-emerald-700"
          data-testid="support-write-msg"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
