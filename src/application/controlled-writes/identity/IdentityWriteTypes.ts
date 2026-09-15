/**
 * Admin identity controlled-write types.
 * Mutations write allowlisted Firestore `user` persona fields only.
 * Auth custom claims are owned by Production CF `syncUserClaimsOnWrite`
 * after the persona write — Admin Next never calls setCustomUserClaims
 * via shadow-reader.
 */

import type { AccessScope, Permission, Role } from "@/types/roles";
import type { IdentityReconciliationState } from "@/domain/identity/IdentityReconciliationState";

/** Canonical panel roles that map to Legacy panel_claims. */
export const IDENTITY_WRITABLE_ROLES = [
  "super_admin",
  "country_admin",
  "accountant",
] as const;

export type IdentityWritableRole = (typeof IDENTITY_WRITABLE_ROLES)[number];

export type IdentityWriteAction =
  | "create_persona"
  | "activate"
  | "deactivate"
  | "assign_role"
  | "change_role"
  | "assign_country_scope"
  | "assign_agent_scope"
  | "clear_scope";

export type VerifiedIdentityWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

export type IdentityWriteCommandBase = {
  actor: VerifiedIdentityWriteActor;
  targetUserId: string;
  expectedCurrentRole: IdentityWritableRole | "none" | "unknown";
  expectedDisabled: boolean;
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
  reasonCode: string;
  note?: string;
};

export type CreatePersonaCommand = IdentityWriteCommandBase & {
  action: "create_persona";
  role: IdentityWritableRole;
  countryId?: string | null;
  agentId?: string | null;
  emailHint?: string | null;
  displayNameHint?: string | null;
};

export type ActivatePersonaCommand = IdentityWriteCommandBase & {
  action: "activate";
};

export type DeactivatePersonaCommand = IdentityWriteCommandBase & {
  action: "deactivate";
};

export type AssignRoleCommand = IdentityWriteCommandBase & {
  action: "assign_role" | "change_role";
  role: IdentityWritableRole;
  countryId?: string | null;
};

export type AssignCountryScopeCommand = IdentityWriteCommandBase & {
  action: "assign_country_scope";
  countryId: string;
};

export type AssignAgentScopeCommand = IdentityWriteCommandBase & {
  action: "assign_agent_scope";
  agentId: string;
  countryId: string;
};

export type ClearScopeCommand = IdentityWriteCommandBase & {
  action: "clear_scope";
};

export type IdentityWriteCommand =
  | CreatePersonaCommand
  | ActivatePersonaCommand
  | DeactivatePersonaCommand
  | AssignRoleCommand
  | AssignCountryScopeCommand
  | AssignAgentScopeCommand
  | ClearScopeCommand;

export type IdentityWriteSnapshot = {
  userId: string;
  exists: boolean;
  isPanelPersona: boolean;
  role: IdentityWritableRole | "none" | "unsupported";
  disabled: boolean;
  countryId: string | null;
  agentId: string | null;
  superAdminCountHint: number | null;
  preconditionToken: string;
  reconciliation: IdentityReconciliationState | "UNKNOWN";
};

export type IdentityWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  ADMIN_IDENTITY_WRITE_ENABLED: boolean;
};

export type IdentityWriteApplyInput = {
  command: IdentityWriteCommand;
  fromRole: IdentityWritableRole | "none" | "unsupported";
  fromDisabled: boolean;
  patch: Record<string, unknown>;
  allowlistedFields: readonly string[];
};

export type IdentityWriteApplyResult = {
  userId: string;
  action: IdentityWriteAction;
  toRole: IdentityWritableRole | "none" | "unsupported";
  toDisabled: boolean;
  preconditionToken: string;
  productionWriteExecuted: boolean;
  claimsMutationPath: "syncUserClaimsOnWrite" | "none";
  patchKeys: readonly string[];
};

export type IdentityWriteCanonicalResponse = {
  ok: boolean;
  status: "applied" | "denied" | "failed" | "idempotent_replay";
  code: string;
  message: string;
  action: IdentityWriteAction;
  targetUserId: string;
  productionWriteExecuted: boolean;
  claimsDirectSetCustomUserClaims: false;
  reconciliation?: IdentityReconciliationState | "UNKNOWN";
  auditIntentId?: string;
  auditResultId?: string;
};
