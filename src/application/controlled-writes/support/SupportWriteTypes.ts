/**
 * Support ticket controlled writes — Legacy `support` collection parity.
 * Stored fields: halh, status, admin_workflow, admin_assigned_to,
 * admin_internal_notes, tsnef, priority, updated_at, resolved_at, closed_at.
 */

import type { AccessScope, Permission, Role } from "@/types/roles";
import type { SupportTicketStatus } from "@/domain/support/SupportTicketMapping";

export type SupportWriteAction =
  | "change_status"
  | "assign"
  | "reassign"
  | "add_note"
  | "resolve"
  | "reopen"
  | "categorize"
  | "update_priority";

export type SupportDisplayStatus =
  | "new"
  | "open"
  | "in_progress"
  | "waiting_user"
  | "resolved"
  | "closed";

export type SupportWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

export type SupportWriteSnapshot = {
  exists: boolean;
  ticketId: string;
  status: SupportTicketStatus;
  displayStatus: SupportDisplayStatus;
  countryId: string | null;
  assignedAdminId: string | null;
  category: string | null;
  priority: string | null;
  isDriverSchema: boolean;
  preconditionToken: string;
};

export type SupportWriteCommand = {
  actor: SupportWriteActor;
  ticketId: string;
  action: SupportWriteAction;
  expectedPreconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
  targetStatus?: SupportDisplayStatus;
  assigneeAdminId?: string;
  noteText?: string;
  category?: string;
  priority?: string;
  reasonCode?: string;
};

export type SupportWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  SUPPORT_WRITE_ENABLED: boolean;
};

export type SupportWriteCanonicalResponse = {
  ok: boolean;
  status: "applied" | "denied" | "failed" | "idempotent_replay";
  code: string;
  message: string;
  action: SupportWriteAction;
  ticketId: string;
  productionWriteExecuted: boolean;
  auditIntentId?: string;
  auditResultId?: string;
  patchKeys?: string[];
};
