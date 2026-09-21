"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import type {
  NotificationAudienceKind,
} from "@/application/controlled-writes/notifications/NotificationWriteTypes";
import type { Role } from "@/types/roles";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { looksLikeQaOrNoncanonicalUserId } from "@/domain/notifications/qaNotificationAudience";

const AUDIENCE_OPTIONS: NotificationAudienceKind[] = [
  "admin_panel",
  "country_admins",
  "role",
  "user_ids",
];

const ROLE_OPTIONS: Role[] = [
  "accountant",
  "country_admin",
  "super_admin",
  "support_agent",
  "operations_manager",
];

type Pending =
  | { kind: "mark_read"; label: MessageKey; path: string; payload: Record<string, unknown> }
  | { kind: "mark_all_read"; label: MessageKey; path: string; payload: Record<string, unknown> }
  | { kind: "compose"; label: MessageKey; path: string; payload: Record<string, unknown> };

export function NotificationWriteActions({
  notificationId,
  onDone,
}: {
  notificationId?: string;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceKind, setAudienceKind] =
    useState<NotificationAudienceKind>("admin_panel");
  const [countryId, setCountryId] = useState("");
  const [role, setRole] = useState<Role>("country_admin");
  const [userIdsRaw, setUserIdsRaw] = useState("");
  const inFlight = useRef(false);

  const canWrite = Boolean(
    session.user &&
      (hasPermission(session.user.permissions, "drivers:approve") ||
        hasPermission(session.user.permissions, "users:manage")),
  );

  if (!isControlledWriteChromeEnabled() || !canWrite) return null;

  const parsedUserIds = userIdsRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const userIdsBlocked =
    audienceKind === "user_ids" &&
    (parsedUserIds.length === 0 ||
      parsedUserIds.some((id) => !looksLikeQaOrNoncanonicalUserId(id)));

  const composeReady =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (audienceKind !== "country_admins" || countryId.trim().length > 0) &&
    (audienceKind !== "user_ids" || !userIdsBlocked);

  const run = async (pending: Pending) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiFetch(pending.path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(pending.payload),
      });
      const json = (await res.json()) as {
        error?: string;
        code?: string;
        ok?: boolean;
      };
      if (!res.ok || json.ok === false) {
        setError(json.error ?? json.code ?? t("error"));
      } else {
        setMessage(t("notificationWriteAppliedFake"));
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

  const buildComposeAudience = (): Record<string, unknown> => {
    if (audienceKind === "country_admins") {
      return { kind: "country_admins", countryId: countryId.trim() };
    }
    if (audienceKind === "role") {
      return { kind: "role", role };
    }
    if (audienceKind === "user_ids") {
      return { kind: "user_ids", userIds: parsedUserIds };
    }
    return { kind: "admin_panel" };
  };

  return (
    <div
      className="rounded border border-slate-200 bg-slate-50 p-3"
      data-testid="notification-write-actions"
    >
      <h3 className="mb-1 text-sm font-semibold">
        {t("notificationActionsTitle")}
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        {t("notificationWriteGateHint")}
      </p>
      <div className="flex flex-wrap gap-2">
        {notificationId ? (
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={busy}
            onClick={() =>
              setConfirming({
                kind: "mark_read",
                label: "markReadAction",
                path: `/api/notifications/${encodeURIComponent(notificationId)}/mark_read`,
                payload: {},
              })
            }
          >
            {t("markReadAction")}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() =>
            setConfirming({
              kind: "mark_all_read",
              label: "markAllReadAction",
              path: "/api/notifications/mark-all-read",
              payload: {},
            })
          }
        >
          {t("markAllReadAction")}
        </button>
      </div>

      {!notificationId ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className="rounded border px-2 py-1 text-sm"
              placeholder={t("title")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              aria-label={t("title")}
            />
            <input
              className="rounded border px-2 py-1 text-sm"
              placeholder={t("notificationBodyPlaceholder")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
              aria-label={t("notificationBodyPlaceholder")}
            />
            <label className="text-xs sm:col-span-2">
              {t("notificationAudience")}
              <select
                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                value={audienceKind}
                onChange={(e) =>
                  setAudienceKind(e.target.value as NotificationAudienceKind)
                }
                disabled={busy}
                data-testid="notification-audience-kind"
              >
                {AUDIENCE_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            {audienceKind === "country_admins" ? (
              <input
                className="rounded border px-2 py-1 text-sm"
                placeholder={t("country")}
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                disabled={busy}
                aria-label={t("country")}
                data-testid="notification-audience-country"
              />
            ) : null}
            {audienceKind === "role" ? (
              <select
                className="rounded border px-2 py-1 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={busy}
                aria-label={t("role")}
                data-testid="notification-audience-role"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : null}
            {audienceKind === "user_ids" ? (
              <div className="sm:col-span-2 space-y-1">
                <input
                  className="w-full rounded border px-2 py-1 text-sm"
                  placeholder={t("notificationUserIdsPlaceholder")}
                  value={userIdsRaw}
                  onChange={(e) => setUserIdsRaw(e.target.value)}
                  disabled={busy}
                  aria-label={t("notificationUserIdsPlaceholder")}
                  data-testid="notification-audience-user-ids"
                />
                <p
                  className="text-xs text-amber-800"
                  data-testid="notification-user-ids-policy"
                >
                  {t("notificationUserIdsPolicy")}
                </p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="mt-2 rounded bg-indigo-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={busy || !composeReady}
            data-testid="notification-compose-submit"
            onClick={() =>
              setConfirming({
                kind: "compose",
                label: "composeNotificationAction",
                path: "/api/notifications/compose",
                payload: {
                  title: title.trim(),
                  body: body.trim(),
                  audience: buildComposeAudience(),
                },
              })
            }
          >
            {t("composeNotificationAction")}
          </button>
        </>
      ) : null}

      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="notification-write"
          confirmTemplateKey="confirmNotificationWrite"
          actionLabelKey={confirming.label}
          targetId={notificationId ?? audienceKind}
          stateLabel={audienceKind}
          pending={busy}
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-red-600" data-testid="notif-write-msg">
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          className="mt-2 text-sm text-emerald-700"
          data-testid="notif-write-msg"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
