/**
 * Phase 5 — Controlled Writes architecture contracts (offline / design).
 * No Production mutation execution. Write flags remain false.
 */

import type { AccessScope, Permission, Role } from "@/types/roles";
import type { ProductionWriteDomain } from "@/config/safety";

export type ControlledWriteResource = "driver" | "agent" | "customer";

export type DriverWriteAction =
  | "approve"
  | "reject"
  | "needs_changes"
  | "suspend";

export type AgentWriteAction = "activate" | "deactivate" | "suspend";

export type CustomerWriteAction = "disable" | "block" | "reactivate";

export type ControlledWriteAction =
  | DriverWriteAction
  | AgentWriteAction
  | CustomerWriteAction;

export type ControlledWriteCommand = {
  resource: ControlledWriteResource;
  action: ControlledWriteAction;
  resourceId: string;
  countryId: string;
  /** Opaque idempotency key — required for every mutation attempt. */
  idempotencyKey: string;
  correlationId: string;
  reasonCode?: string;
  /** Expected precondition snapshot (never blind overwrite). */
  expected?: ControlledWriteExpectedState;
};

export type ControlledWriteExpectedState = {
  /** Driver registration / account axes when known. */
  registrationStatus?: string;
  accountEnabled?: "enabled" | "disabled" | "unknown";
  /** Agent operational / account. */
  agentOperationalActive?: boolean;
  agentAccountState?: "enabled" | "disabled" | "unknown";
  /** Customer account. */
  customerAccountState?: "enabled" | "disabled" | "unknown";
  /** Optional Firestore/update generation token for concurrency. */
  preconditionToken?: string;
};

export type ControlledWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

export type ControlledWriteDenialCode =
  | "WRITE_FLAGS_DISABLED"
  | "RESOURCE_FLAG_DISABLED"
  | "GLOBAL_WRITE_DISABLED"
  | "ACTION_NOT_IN_SCOPE"
  | "ACTION_DEFERRED"
  | "RBAC_DENIED"
  | "SCOPE_DENIED"
  | "PRECONDITION_FAILED"
  | "AGENT_COUNTRY_ACTIVE_CONFLICT"
  | "IDEMPOTENCY_REPLAY"
  | "IDEMPOTENCY_CONFLICT"
  | "AUDIT_REQUIRED"
  | "REPOSITORY_DISABLED"
  | "FINANCE_FORBIDDEN";

export type ControlledWritePipelineStage =
  | "command"
  | "authenticated_actor"
  | "write_flags"
  | "rbac"
  | "scope"
  | "precondition_read"
  | "validation"
  | "idempotency"
  | "audit_intent"
  | "controlled_repository"
  | "write_result"
  | "audit_result";

export type ControlledWriteStageResult = {
  stage: ControlledWritePipelineStage;
  ok: boolean;
  code?: ControlledWriteDenialCode | string;
  detail?: string;
};

export type ControlledWriteOutcome =
  | {
      ok: true;
      status: "applied" | "idempotent_replay";
      stages: ControlledWriteStageResult[];
      auditIntentId: string;
      auditResultId: string;
      /** Always false against Production in Phase 5 readiness. */
      productionWriteExecuted: false;
    }
  | {
      ok: false;
      status: "denied" | "failed";
      stages: ControlledWriteStageResult[];
      code: ControlledWriteDenialCode | string;
      message: string;
      productionWriteExecuted: false;
    };

export type ControlledWriteFlagSnapshot = {
  PRODUCTION_WRITE_ENABLED: boolean;
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  AGENT_WRITE_ENABLED: boolean;
  CUSTOMER_WRITE_ENABLED: boolean;
  FINANCE_WRITE_ENABLED: boolean;
};

export function resourceToWriteDomain(
  resource: ControlledWriteResource,
): ProductionWriteDomain {
  return resource;
}
