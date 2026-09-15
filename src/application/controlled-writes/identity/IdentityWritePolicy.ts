/**
 * Identity write security policy — anti-self-escalation, canonical roles only.
 */

import type { Role } from "@/types/roles";
import {
  IDENTITY_WRITABLE_ROLES,
  type IdentityWritableRole,
  type IdentityWriteCommand,
  type IdentityWriteSnapshot,
  type VerifiedIdentityWriteActor,
} from "@/application/controlled-writes/identity/IdentityWriteTypes";

const ROLE_RANK: Record<IdentityWritableRole, number> = {
  accountant: 1,
  country_admin: 2,
  super_admin: 3,
};

export function isIdentityWritableRole(
  role: string,
): role is IdentityWritableRole {
  return (IDENTITY_WRITABLE_ROLES as readonly string[]).includes(role);
}

export function actorCanAssignRole(
  actorRole: Role,
  targetRole: IdentityWritableRole,
): boolean {
  if (actorRole === "super_admin") return true;
  if (actorRole === "operations_manager") {
    return targetRole !== "super_admin";
  }
  if (actorRole === "country_admin") {
    return targetRole === "accountant" || targetRole === "country_admin";
  }
  return false;
}

export function assertIdentityWriteAuthorization(input: {
  actor: VerifiedIdentityWriteActor;
  command: IdentityWriteCommand;
  snapshot: IdentityWriteSnapshot;
}): { ok: true } | { ok: false; code: string; message: string } {
  const { actor, command, snapshot } = input;

  if (!actor.permissions.includes("users:manage")) {
    return {
      ok: false,
      code: "PERMISSION_DENIED",
      message: "users:manage required",
    };
  }

  if (command.targetUserId === actor.uid) {
    const selfEscalating =
      command.action === "assign_role" ||
      command.action === "change_role" ||
      command.action === "create_persona" ||
      command.action === "activate";
    if (selfEscalating) {
      return {
        ok: false,
        code: "SELF_ESCALATION_DENIED",
        message: "Actor cannot self-promote or self-create persona",
      };
    }
    if (command.action === "deactivate") {
      return {
        ok: false,
        code: "SELF_ESCALATION_DENIED",
        message: "Actor cannot deactivate self",
      };
    }
  }

  if (
    command.action === "assign_role" ||
    command.action === "change_role" ||
    command.action === "create_persona"
  ) {
    const role = command.role;
    if (!isIdentityWritableRole(role)) {
      return {
        ok: false,
        code: "INVALID_ROLE",
        message: "Only canonical panel roles are writable",
      };
    }
    if (!actorCanAssignRole(actor.role, role)) {
      return {
        ok: false,
        code: "ESCALATION_DENIED",
        message: `Actor role ${actor.role} cannot assign ${role}`,
      };
    }
    if (
      snapshot.role !== "none" &&
      snapshot.role !== "unsupported" &&
      ROLE_RANK[role] > ROLE_RANK[snapshot.role] &&
      actor.role !== "super_admin"
    ) {
      return {
        ok: false,
        code: "ESCALATION_DENIED",
        message: "Cannot escalate target above current without super_admin",
      };
    }
  }

  if (
    (command.action === "deactivate" ||
      command.action === "change_role" ||
      command.action === "assign_role") &&
    snapshot.role === "super_admin" &&
    snapshot.superAdminCountHint === 1
  ) {
    const removingSuper =
      command.action === "deactivate" ||
      ((command.action === "change_role" || command.action === "assign_role") &&
        command.role !== "super_admin");
    if (removingSuper) {
      return {
        ok: false,
        code: "LAST_SUPER_ADMIN_PROTECTED",
        message: "Cannot remove the last viable super_admin",
      };
    }
  }

  if (actor.role === "country_admin") {
    const actorCountries = actor.scope.countryIds ?? [];
    if (command.action === "assign_country_scope") {
      if (!actorCountries.includes(command.countryId)) {
        return {
          ok: false,
          code: "SCOPE_DENIED",
          message: "Country scope outside actor authority",
        };
      }
    }
    if (
      snapshot.countryId &&
      actorCountries.length > 0 &&
      !actorCountries.includes(snapshot.countryId)
    ) {
      return {
        ok: false,
        code: "SCOPE_DENIED",
        message: "Target outside actor country scope",
      };
    }
  }

  return { ok: true };
}

/**
 * Build allowlisted Firestore persona patch from command.
 * Never includes arbitrary claim keys.
 */
export function buildIdentityPersonaPatch(
  command: IdentityWriteCommand,
): { patch: Record<string, unknown>; allowlistedFields: string[] } {
  switch (command.action) {
    case "activate":
      return {
        patch: { actev_user: true, disabled: false, active: true },
        allowlistedFields: ["actev_user", "disabled", "active"],
      };
    case "deactivate":
      return {
        patch: { actev_user: false, disabled: true, active: false },
        allowlistedFields: ["actev_user", "disabled", "active"],
      };
    case "create_persona":
    case "assign_role":
    case "change_role": {
      const patch = personaFieldsForRole(command.role, command.countryId ?? null);
      return { patch, allowlistedFields: Object.keys(patch) };
    }
    case "assign_country_scope": {
      const path = countryPath(command.countryId);
      return {
        patch: { Rev_dolh: { path }, Rev_dloh_agent: { path } },
        allowlistedFields: ["Rev_dolh", "Rev_dloh_agent"],
      };
    }
    case "assign_agent_scope": {
      const countryPathValue = countryPath(command.countryId);
      return {
        patch: {
          Isagent: true,
          isagent: true,
          agentId: command.agentId,
          Rev_dolh: { path: countryPathValue },
          Rev_dloh_agent: { path: countryPathValue },
        },
        allowlistedFields: [
          "Isagent",
          "isagent",
          "agentId",
          "Rev_dolh",
          "Rev_dloh_agent",
        ],
      };
    }
    case "clear_scope":
      return {
        patch: {
          Rev_dolh: null,
          Rev_dloh_agent: null,
          agentId: null,
          Isagent: false,
          isagent: false,
        },
        allowlistedFields: [
          "Rev_dolh",
          "Rev_dloh_agent",
          "agentId",
          "Isagent",
          "isagent",
        ],
      };
  }
}

function countryPath(countryId: string): string {
  const id = countryId.trim();
  if (id.includes("/")) return id;
  return `countries/${id}`;
}

function personaFieldsForRole(
  role: IdentityWritableRole,
  countryId: string | null,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    IsAdmin: false,
    isAdmin: false,
    isAdminRule: 0,
    IsAdminRule: 0,
  };
  if (role === "super_admin") {
    return {
      ...base,
      IsAdmin: true,
      isAdmin: true,
      isAdminRule: 1,
      IsAdminRule: 1,
    };
  }
  if (role === "country_admin") {
    const patch: Record<string, unknown> = {
      ...base,
      isAdminRule: 2,
      IsAdminRule: 2,
    };
    if (countryId) {
      const path = countryPath(countryId);
      patch.Rev_dolh = { path };
      patch.Rev_dloh_agent = { path };
    }
    return patch;
  }
  // accountant
  return {
    ...base,
    isAdminRule: 5,
    IsAdminRule: 5,
  };
}
