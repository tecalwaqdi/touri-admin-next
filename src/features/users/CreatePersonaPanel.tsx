"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";
import {
  actorCanAssignRole,
  isIdentityWritableRole,
} from "@/application/controlled-writes/identity/IdentityWritePolicy";
import {
  IDENTITY_WRITABLE_ROLES,
  type IdentityWritableRole,
} from "@/application/controlled-writes/identity/IdentityWriteTypes";

/**
 * Create panel persona — Fake/offline when chrome + development synthetic.
 * Production remains gated (ADMIN_IDENTITY_WRITE_ENABLED). No privilege escalation.
 */
export function CreatePersonaPanel({
  onCreated,
}: {
  onCreated?: (userId: string) => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [role, setRole] = useState<IdentityWritableRole>("accountant");
  const [qaFixture, setQaFixture] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      !!session?.user &&
      hasPermission(session.user.permissions, "users:manage") &&
      isControlledWriteChromeEnabled(),
    [session],
  );

  const assignableRoles = useMemo(() => {
    const actorRole = session?.user?.role;
    if (!actorRole) return [] as IdentityWritableRole[];
    return IDENTITY_WRITABLE_ROLES.filter((r) =>
      actorCanAssignRole(actorRole, r),
    );
  }, [session?.user?.role]);

  if (!canWrite) return null;

  const run = async () => {
    if (inFlight.current) return;
    const id = targetUserId.trim();
    if (!id || !isIdentityWritableRole(role)) {
      setError(t("error"));
      return;
    }
    if (!actorCanAssignRole(session!.user!.role, role)) {
      setError(t("identityEscalationDenied"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(
        `/api/users/${encodeURIComponent(id)}/create_persona`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            role,
            countryId: countryId.trim() || null,
            displayNameHint: displayName.trim() || null,
            qaFixture,
            expectedCurrentRole: "none",
            expectedDisabled: false,
            preconditionToken: `create_${id}`,
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
      setSuccess(t("writeApplied"));
      setConfirming(false);
      setOpen(false);
      onCreated?.(id);
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div data-testid="create-persona" className="mb-3">
      {!open ? (
        <button
          type="button"
          className={adminUi.btnPrimary}
          data-testid="create-persona-open"
          onClick={() => setOpen(true)}
        >
          {t("createPersonaAction")}
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className={`mb-3 ${adminUi.caption}`}>{t("createPersonaHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                {t("id")} <span className="text-rose-600">*</span>
              </span>
              <input
                className={adminUi.filterControl}
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                data-testid="create-persona-user-id"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("displayName")}</span>
              <input
                className={adminUi.filterControl}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("role")}</span>
              <select
                className={adminUi.filterControl}
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as IdentityWritableRole)
                }
                data-testid="create-persona-role"
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">{t("country")}</span>
              <input
                className={adminUi.filterControl}
                value={countryId}
                onChange={(e) => setCountryId(e.target.value)}
                data-testid="create-persona-country"
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={qaFixture}
                onChange={(e) => setQaFixture(e.target.checked)}
                data-testid="create-persona-qa-fixture"
              />
              {t("createPersonaQaFixture")}
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={adminUi.btnPrimary}
              disabled={pending || !targetUserId.trim() || assignableRoles.length === 0}
              onClick={() => setConfirming(true)}
              data-testid="create-persona-submit"
            >
              {t("createPersonaAction")}
            </button>
            <button
              type="button"
              className={adminUi.btnGhost}
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </button>
          </div>
          {confirming ? (
            <ControlledWriteConfirmPanel
              testIdPrefix="create-persona"
              confirmTemplateKey="confirmIdentityWrite"
              actionLabelKey="createPersonaAction"
              targetId={targetUserId.trim() || "—"}
              stateLabel={role}
              pending={pending}
              onConfirm={() => void run()}
              onCancel={() => setConfirming(false)}
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
        </div>
      )}
    </div>
  );
}
