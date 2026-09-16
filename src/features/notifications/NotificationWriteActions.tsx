"use client";

import { useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";

export function NotificationWriteActions({
  notificationId,
  onDone,
}: {
  notificationId?: string;
  onDone?: () => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const chromeOn =
    process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI === "true" ||
    process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI === "1";

  const canWrite = Boolean(
    session.user &&
      (hasPermission(session.user.permissions, "drivers:approve") ||
        hasPermission(session.user.permissions, "users:manage")),
  );

  if (!chromeOn || !canWrite) return null;

  const run = async (path: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        setMessage(json.error ?? json.code ?? t("error"));
      } else {
        setMessage(
          locale === "ar"
            ? "تم (بدون إرسال إنتاجي)"
            : "Applied (no Production push)",
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
      data-testid="notification-write-actions"
    >
      <h3 className="mb-1 text-sm font-semibold">
        {locale === "ar" ? "إجراءات الإشعارات" : "Notification actions"}
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        NOTIFICATION_WRITE_ENABLED=false · Fake adapter
      </p>
      <div className="flex flex-wrap gap-2">
        {notificationId ? (
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={busy}
            onClick={() =>
              void run(
                `/api/notifications/${encodeURIComponent(notificationId)}/mark_read`,
                {},
              )
            }
          >
            {locale === "ar" ? "تمييز كمقروء" : "Mark read"}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void run("/api/notifications/mark-all-read", {})}
        >
          {locale === "ar" ? "تمييز الكل كمقروء" : "Mark all read"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder={locale === "ar" ? "العنوان" : "Title"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder={locale === "ar" ? "النص" : "Body"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
        />
      </div>
      <button
        type="button"
        className="mt-2 rounded bg-indigo-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        disabled={busy || !title.trim() || !body.trim()}
        onClick={() =>
          void run("/api/notifications/compose", {
            title,
            body,
            audience: { kind: "admin_panel" },
          })
        }
      >
        {locale === "ar" ? "إرسال إلى لوحة الإدارة" : "Compose to admin panel"}
      </button>
      {message ? (
        <p className="mt-2 text-sm text-slate-600" data-testid="notif-write-msg">
          {message}
        </p>
      ) : null}
    </div>
  );
}
