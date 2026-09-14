/**
 * Phase 5C — Customer Controlled Write types & commands.
 * Scope: disable | block | reactivate only.
 * No Production mutation; flags remain false.
 * No delete / Auth hard-delete / wallet / PII edit / country change.
 */

import type { AccessScope, Permission, Role } from "@/types/roles";
import type { CustomerWriteErrorCode } from "@/application/controlled-writes/customers/CustomerWriteErrors";

export type CustomerControlledWriteAction =
  | "disable"
  | "block"
  | "reactivate";

export type ProvenCustomerOperationalState =
  | "enabled"
  | "disabled"
  | "blocked"
  | "deleted"
  | "unknown";

export type CustomerCountryScopeKind =
  | "mapped"
  | "not_represented"
  | "unknown"
  | "unmapped";

/** Mapping / membership partition from Phase 4A-7 (safe enum only). */
export type CustomerMembershipMappingStatus =
  | "operational"
  | "excludedNonCustomer"
  | "excludedUnknownIdentity"
  | "unmapped"
  | "unknown";

/**
 * Conflicting / non-customer roles that MUST deny Controlled Writes
 * (shared `user` contamination — 4A-7).
 */
export type CustomerConflictingRole =
  | "driver"
  | "agent"
  | "super_admin"
  | "finance"
  | "country_admin"
  | "partner"
  | "transport"
  | "tour_guide"
  | "none"
  | "unknown";

export type CustomerDisableReasonCode =
  | "operational"
  | "safety"
  | "abuse"
  | "inactivity"
  | "other";

export type CustomerBlockReasonCode =
  | "policy_violation"
  | "safety"
  | "fraud"
  | "abuse"
  | "compliance"
  | "other";

export type CustomerReactivateReasonCode =
  | "appeal_approved"
  | "error_correction"
  | "operational"
  | "other";

export type VerifiedCustomerWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

/** Shared fields on every Customer Controlled Write command. */
export type CustomerWriteCommandBase = {
  actor: VerifiedCustomerWriteActor;
  customerId: string;
  /** Expected application/account state at command time (concurrency). */
  expectedCurrentState: ProvenCustomerOperationalState;
  /** Opaque concurrency token from updateTime / version / safe hash. */
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
};

export type DisableCustomerCommand = CustomerWriteCommandBase & {
  action: "disable";
  reasonCode: CustomerDisableReasonCode;
  /** Optional operator note — sanitized; never raw PII. */
  note?: string;
};

export type BlockCustomerCommand = CustomerWriteCommandBase & {
  action: "block";
  reasonCode: CustomerBlockReasonCode;
  note?: string;
};

export type ReactivateCustomerCommand = CustomerWriteCommandBase & {
  action: "reactivate";
  reasonCode?: CustomerReactivateReasonCode;
  note?: string;
};

export type CustomerControlledWriteCommand =
  | DisableCustomerCommand
  | BlockCustomerCommand
  | ReactivateCustomerCommand;

/**
 * Canonical Customer snapshot loaded for write preconditions.
 * Safe fields only — no phone/email/FCM/national ID/address/display names.
 *
 * Membership (4A-7): candidate + positive evidence + no conflicting role.
 * Existence of user/{uid} alone is NOT sufficient.
 */
export type CustomerWriteSnapshot = {
  customerId: string;
  exists: boolean;
  /** candidate && positive && !knownOtherRole */
  isOperationalCustomer: boolean;
  isCustomerCandidate: boolean;
  hasPositiveCustomerEvidence: boolean;
  /** True when mappingStatus === excludedNonCustomer. */
  excludedNonCustomer: boolean;
  /** True when mappingStatus === excludedUnknownIdentity. */
  excludedUnknownIdentity: boolean;
  mappingStatus: CustomerMembershipMappingStatus;
  conflictingRole: CustomerConflictingRole;
  operationalState: ProvenCustomerOperationalState;
  /** Firestore application/account state — preferred over Auth for Phase 5C. */
  accountEnabled: "enabled" | "disabled" | "unknown";
  /** Active trip guard input. Prefer DENY mid-trip disable/block. */
  tripState: "idle" | "active" | "unknown";
  /** Canonical country id when mapped; null when absent / not represented. */
  countryId: string | null;
  countryScopeKind: CustomerCountryScopeKind;
  preconditionToken: string;
  /** Optional generation / updateTime for concurrency diagnostics (safe). */
  updateGeneration?: string | null;
};

export type CustomerWriteApplyInput = {
  command: CustomerControlledWriteCommand;
  snapshot: CustomerWriteSnapshot;
  fromState: ProvenCustomerOperationalState;
  toState: ProvenCustomerOperationalState;
};

export type CustomerWriteApplyResult = {
  customerId: string;
  countryId: string | null;
  fromState: ProvenCustomerOperationalState;
  toState: ProvenCustomerOperationalState;
  preconditionTokenAfter: string;
  appliedAtUtc: string;
  /** Always false in Phase 5C — Auth sync deferred. */
  authWriteExecuted: false;
};

export type CustomerWriteCanonicalResponse =
  | {
      ok: true;
      status: "applied" | "idempotent_replay";
      action: CustomerControlledWriteAction;
      customerId: string;
      countryId: string | null;
      fromState: ProvenCustomerOperationalState;
      toState: ProvenCustomerOperationalState;
      auditIntentId: string;
      auditResultId: string;
      productionWriteExecuted: false;
      authWriteExecuted: false;
      previousResult?: CustomerWriteCanonicalResponse;
    }
  | {
      ok: false;
      status: "denied" | "failed";
      code: CustomerWriteErrorCode;
      message: string;
      action: CustomerControlledWriteAction;
      customerId: string;
      productionWriteExecuted: false;
      authWriteExecuted: false;
      auditIntentId?: string;
      auditResultId?: string;
    };

export type CustomerWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  CUSTOMER_WRITE_ENABLED: boolean;
  /** Auth disable/enable sync — always false in Phase 5C. */
  CUSTOMER_AUTH_WRITE_ENABLED: boolean;
};

export function toProvenCustomerState(
  status: string,
): ProvenCustomerOperationalState {
  switch (status) {
    case "enabled":
    case "disabled":
    case "blocked":
    case "deleted":
    case "unknown":
      return status;
    default:
      return "unknown";
  }
}
