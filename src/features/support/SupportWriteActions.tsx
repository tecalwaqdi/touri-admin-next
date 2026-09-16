"use client";

import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { SupportDisplayStatus } from "@/application/controlled-writes/support/SupportWriteTypes";

const STATUS_OPTIONS: SupportDisplayStatus[] = [
  "open",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
];

export function SupportWriteActions({
  ticketId,
  preconditionToken,
  onDone,
}: {
  ticketId: string;
  preconditionToken: string;
  onDone?: () => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [targetStatus, setTargetStatus] =
    useState<SupportDisplayStatus>("in_progress");
  const [note, setNote] = useState("");
  const chromeOn =
    process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI === "true" ||
    process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI === "1";

  const canWrite = Boolean(
    session.user &&
      (hasPermission(session.user.permissions, "customers:manage") ||
        hasPermission(session.user.permissions, "users:manage")),
  );

  if (!chromeOn || !canWrite) return null;

  const post = async (action: string, body: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch(
        `/api/support/${encodeURIComponent(ticketId)}/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedPreconditionToken: preconditionToken,
            ...body,
          }),
        },
      );
      const json = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) {
        setMessage(json.error ?? json.code ?? t("error"));
      } else {
        setMessage(
          locale === "ar" ? "تم (بوابة مغلقة للإنتاج)" : "Applied (Production gate OFF)",
        );
        onDone?.();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded border border-slate-200 bg-slate-50 p-3"
      data-testid="support-write-actions"
    >
      <h3 className="mb-1 text-sm font-semibold">
        {locale === "ar" ? "إجراءات الدعم" : "Support actions"}
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        SUPPORT_WRITE_ENABLED=false
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <select
          className="rounded border px-2 py-1 text-sm"
          value={targetStatus}
          onChange={(e) =>
            setTargetStatus(e.target.value as SupportDisplayStatus)
          }
          disabled={busy}
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
          onClick={() => void post("change_status", { targetStatus })}
        >
          {locale === "ar" ? "تغيير الحالة" : "Change status"}
        </button>
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            void post("assign", { assigneeAdminId: session.user?.id })
          }
        >
          {locale === "ar" ? "تعيين لي" : "Assign to me"}
        </button>
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void post("resolve", {})}
        >
          {locale === "ar" ? "حل" : "Resolve"}
        </button>
        <button
          type="button"
          className="rounded bg-slate-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void post("reopen", {})}
        >
          {locale === "ar" ? "إعادة فتح" : "Reopen"}
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
          placeholder={locale === "ar" ? "ملاحظة داخلية" : "Internal note"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={busy || !note.trim()}
          onClick={() => void post("add_note", { noteText: note })}
        >
          {locale === "ar" ? "إضافة ملاحظة" : "Add note"}
        </button>
      </div>
      {message ? (
        <p className="mt-2 text-sm text-slate-600" data-testid="support-write-msg">
          {message}
        </p>
      ) : null}
    </div>
  );
}
