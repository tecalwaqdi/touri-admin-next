"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import {
  actorCanAssignRole,
} from "@/application/controlled-writes/identity/IdentityWritePolicy";
import {
  IDENTITY_WRITABLE_ROLES,
  type IdentityWritableRole,
} from "@/application/controlled-writes/identity/IdentityWriteTypes";

type UiAction = {
  api:
    | "activate"
    | "deactivate"
    | "change_role"
    | "assign_country_scope"
    | "assign_agent_scope"
    | "clear_scope";
  label: MessageKey;
};

export function UserIdentityWriteActions({
  userId,
  role,
  status,
  countryId,
  preconditionToken,
  onDone,
}: {
  userId: string;
  role: string;
  status: string;
  countryId?: string | null;
  preconditionToken: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState<UiAction | null>(null);
  const [nextRole, setNextRole] = useState<IdentityWritableRole>("accountant");
  const [nextCountry, setNextCountry] = useState(countryId ?? "");
  const [agentId, setAgentId] = useState("");
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

  const actions: UiAction[] = [
    { api: "activate", label: "activateAction" },
    { api: "deactivate", label: "deactivateAction" },
    { api: "change_role", label: "changeRoleAction" },
    { api: "assign_country_scope", label: "assignScopeAction" },
    { api: "assign_agent_scope", label: "assignAgentScopeAction" },
    { api: "clear_scope", label: "clearScopeAction" },
  ];

  const run = async (action: UiAction) => {
    if (inFlight.current) return;
    if (
      action.api === "change_role" &&
      session?.user &&
      !actorCanAssignRole(session.user.role, nextRole)
    ) {
      setError(t("identityEscalationDenied"));
      setConfirming(null);
      return;
    }
    inFlight.current = true;
    setPending(action.api);
    setError(undefined);
    setSuccess(undefined);
    try {
      const body: Record<string, unknown> = {
        expectedCurrentRole: role,
        expectedDisabled: status === "disabled",
        preconditionToken,
        reasonCode: "operational",
      };
      if (action.api === "change_role") body.role = nextRole;
      if (action.api === "assign_country_scope") body.countryId = nextCountry;
      if (action.api === "assign_agent_scope") {
        body.agentId = agentId.trim();
        body.countryId = nextCountry.trim() || countryId || "";
      }
      const res = await apiFetch(`/api/users/${encodeURIComponent(userId)}/${action.api}`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        ok?: boolean;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error ?? json.code ?? t("error"));
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
    <div data-testid="user-identity-write-actions" className="space-y-3">
      <h3 className="text-sm font-semibold">{t("identityActionsTitle")}</h3>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs">
          {t("role")}
          <select
            className="ml-2 rounded border px-2 py-1"
            value={nextRole}
            onChange={(e) =>
              setNextRole(e.target.value as IdentityWritableRole)
            }
            data-testid="identity-next-role"
          >
            {(assignableRoles.length ? assignableRoles : IDENTITY_WRITABLE_ROLES).map(
              (r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="text-xs">
          {t("country")}
          <input
            className="ml-2 rounded border px-2 py-1"
            value={nextCountry}
            onChange={(e) => setNextCountry(e.target.value)}
            data-testid="identity-next-country"
          />
        </label>
        <label className="text-xs">
          {t("agentId")}
          <input
            className="ml-2 rounded border px-2 py-1"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            data-testid="identity-agent-id"
            placeholder={t("agentId")}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.api}
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            disabled={
              !!pending ||
              (a.api === "assign_agent_scope" &&
                (!agentId.trim() || !(nextCountry.trim() || countryId)))
            }
            onClick={() => setConfirming(a)}
            data-testid={`identity-action-${a.api}`}
          >
            {t(a.label)}
          </button>
        ))}
      </div>
      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="identity-write"
          confirmTemplateKey="confirmIdentityWrite"
          actionLabelKey={confirming.label}
          targetId={userId}
          stateLabel={role}
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
