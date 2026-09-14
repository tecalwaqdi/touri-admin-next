/**
 * Phase 5A — Driver Controlled Write types & commands.
 * Scope: approve | reject | needs_changes | suspend only.
 * No Production mutation; flags remain false.
 */

import type { AccessScope, Permission, Role } from "@/types/roles";
import type { CanonicalDriverRegistrationStatus } from "@/domain/driver/CanonicalDriverRegistrationStatus";
import type { DriverWriteErrorCode } from "@/application/controlled-writes/drivers/DriverWriteErrors";

export type DriverControlledWriteAction =
  | "approve"
  | "reject"
  | "needs_changes"
  | "suspend";

export type ProvenDriverRegistrationState =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_changes"
  | "suspended"
  | "unknown";

export type DriverCountryScopeKind =
  | "mapped"
  | "not_represented"
  | "unknown"
  | "unmapped";

export type DriverRejectReasonCode =
  | "missing_document"
  | "invalid_document"
  | "identity_mismatch"
  | "vehicle_incomplete"
  | "compliance_incomplete"
  | "other";

export type DriverChangesReasonCode =
  | "missing_document"
  | "invalid_document"
  | "photo_quality"
  | "vehicle_incomplete"
  | "compliance_incomplete"
  | "other";

export type DriverSuspendReasonCode =
  | "policy_violation"
  | "safety"
  | "compliance"
  | "operational"
  | "other";

export type VerifiedDriverWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

/** Shared fields on every Driver Controlled Write command. */
export type DriverWriteCommandBase = {
  actor: VerifiedDriverWriteActor;
  driverId: string;
  /** Expected registration state at command time (concurrency). */
  expectedCurrentState: ProvenDriverRegistrationState;
  /** Opaque concurrency token from updateTime / version / safe hash. */
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
};

export type ApproveDriverCommand = DriverWriteCommandBase & {
  action: "approve";
};

export type RejectDriverCommand = DriverWriteCommandBase & {
  action: "reject";
  reasonCode: DriverRejectReasonCode;
  /** Optional operator note — sanitized; never raw PII. */
  note?: string;
};

export type RequestDriverChangesCommand = DriverWriteCommandBase & {
  action: "needs_changes";
  reasonCode: DriverChangesReasonCode;
  note?: string;
};

export type SuspendDriverCommand = DriverWriteCommandBase & {
  action: "suspend";
  reasonCode: DriverSuspendReasonCode;
  note?: string;
};

export type DriverControlledWriteCommand =
  | ApproveDriverCommand
  | RejectDriverCommand
  | RequestDriverChangesCommand
  | SuspendDriverCommand;

/**
 * Canonical Driver snapshot loaded for write preconditions.
 * Safe fields only — no phone/email/national ID/IBAN/URLs.
 */
export type DriverWriteSnapshot = {
  driverId: string;
  exists: boolean;
  isOperationalDriver: boolean;
  registrationStatus: ProvenDriverRegistrationState;
  accountEnabled: "enabled" | "disabled" | "unknown";
  complianceStatus: "ready" | "incomplete" | "expired" | "unknown";
  tripState: "idle" | "busy" | "unknown";
  /** Canonical country id when mapped; null when absent. */
  countryId: string | null;
  countryScopeKind: DriverCountryScopeKind;
  preconditionToken: string;
  /** Optional generation / updateTime for concurrency diagnostics (safe). */
  updateGeneration?: string | null;
};

export type DriverWriteApplyInput = {
  command: DriverControlledWriteCommand;
  snapshot: DriverWriteSnapshot;
  fromState: ProvenDriverRegistrationState;
  toState: ProvenDriverRegistrationState;
};

export type DriverWriteApplyResult = {
  driverId: string;
  fromState: ProvenDriverRegistrationState;
  toState: ProvenDriverRegistrationState;
  preconditionTokenAfter: string;
  appliedAtUtc: string;
};

export type DriverWriteCanonicalResponse =
  | {
      ok: true;
      status: "applied" | "idempotent_replay";
      action: DriverControlledWriteAction;
      driverId: string;
      fromState: ProvenDriverRegistrationState;
      toState: ProvenDriverRegistrationState;
      auditIntentId: string;
      auditResultId: string;
      productionWriteExecuted: false;
      previousResult?: DriverWriteCanonicalResponse;
    }
  | {
      ok: false;
      status: "denied" | "failed";
      code: DriverWriteErrorCode;
      message: string;
      action: DriverControlledWriteAction;
      driverId: string;
      productionWriteExecuted: false;
      auditIntentId?: string;
      auditResultId?: string;
    };

export type DriverWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  /** Structural Production path flag — must stay false in Phase 5A. */
  PRODUCTION_WRITE_ENABLED?: boolean;
};

/** Align ProvenDriverRegistrationState with CanonicalDriverRegistrationStatus. */
export function toProvenDriverState(
  status: CanonicalDriverRegistrationStatus | string,
): ProvenDriverRegistrationState {
  switch (status) {
    case "draft":
    case "pending_review":
    case "approved":
    case "rejected":
    case "needs_changes":
    case "suspended":
    case "unknown":
      return status;
    default:
      return "unknown";
  }
}
