/**
 * Phase 5B — Agent Controlled Write types & commands.
 * Scope: activate | deactivate | suspend only.
 * No Production mutation; flags remain false.
 * ONE COUNTRY = MAX ONE ACTIVE AGENT (server-side).
 */

import type { AccessScope, Permission, Role } from "@/types/roles";
import type { AgentWriteErrorCode } from "@/application/controlled-writes/agents/AgentWriteErrors";

export type AgentControlledWriteAction =
  | "activate"
  | "deactivate"
  | "suspend";

export type ProvenAgentOperationalState =
  | "active"
  | "inactive"
  | "suspended"
  | "pending"
  | "unknown";

export type AgentCountryScopeKind =
  | "mapped"
  | "not_represented"
  | "unknown"
  | "unmapped";

export type AgentSuspendReasonCode =
  | "policy_violation"
  | "safety"
  | "compliance"
  | "operational"
  | "other";

export type AgentDeactivateReasonCode =
  | "operational"
  | "contract_ended"
  | "replaced"
  | "other";

export type VerifiedAgentWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

/** Shared fields on every Agent Controlled Write command. */
export type AgentWriteCommandBase = {
  actor: VerifiedAgentWriteActor;
  agentId: string;
  /**
   * Explicit country — no inference. Must match snapshot.countryId;
   * mismatch → COUNTRY_REASSIGNMENT_NOT_ALLOWED.
   */
  countryId: string;
  /** Expected operational state at command time (concurrency). */
  expectedCurrentState: ProvenAgentOperationalState;
  /** Opaque concurrency token from updateTime / version / safe hash. */
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
};

export type ActivateAgentCommand = AgentWriteCommandBase & {
  action: "activate";
};

export type DeactivateAgentCommand = AgentWriteCommandBase & {
  action: "deactivate";
  reasonCode?: AgentDeactivateReasonCode;
  note?: string;
};

export type SuspendAgentCommand = AgentWriteCommandBase & {
  action: "suspend";
  reasonCode: AgentSuspendReasonCode;
  /** Optional operator note — sanitized; never raw PII. */
  note?: string;
};

export type AgentControlledWriteCommand =
  | ActivateAgentCommand
  | DeactivateAgentCommand
  | SuspendAgentCommand;

/**
 * Canonical Agent snapshot loaded for write preconditions.
 * Safe fields only — no phone/email/IBAN/bank/contracts/address/docs.
 */
export type AgentWriteSnapshot = {
  agentId: string;
  exists: boolean;
  isOperationalAgent: boolean;
  /** True when mappingStatus === excludedNonAgent. */
  excludedNonAgent: boolean;
  operationalState: ProvenAgentOperationalState;
  accountEnabled: "enabled" | "disabled" | "unknown";
  /** Canonical country id when mapped; null when absent. */
  countryId: string | null;
  countryScopeKind: AgentCountryScopeKind;
  preconditionToken: string;
  /** Optional generation / updateTime for concurrency diagnostics (safe). */
  updateGeneration?: string | null;
};

export type AgentWriteApplyInput = {
  command: AgentControlledWriteCommand;
  snapshot: AgentWriteSnapshot;
  fromState: ProvenAgentOperationalState;
  toState: ProvenAgentOperationalState;
};

export type AgentWriteApplyResult = {
  agentId: string;
  countryId: string;
  fromState: ProvenAgentOperationalState;
  toState: ProvenAgentOperationalState;
  preconditionTokenAfter: string;
  appliedAtUtc: string;
};

export type AgentWriteCanonicalResponse =
  | {
      ok: true;
      status: "applied" | "idempotent_replay";
      action: AgentControlledWriteAction;
      agentId: string;
      countryId: string;
      fromState: ProvenAgentOperationalState;
      toState: ProvenAgentOperationalState;
      auditIntentId: string;
      auditResultId: string;
      productionWriteExecuted: false;
      previousResult?: AgentWriteCanonicalResponse;
    }
  | {
      ok: false;
      status: "denied" | "failed";
      code: AgentWriteErrorCode;
      message: string;
      action: AgentControlledWriteAction;
      agentId: string;
      productionWriteExecuted: false;
      auditIntentId?: string;
      auditResultId?: string;
    };

export type AgentWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  AGENT_WRITE_ENABLED: boolean;
};

export function toProvenAgentState(
  status: string,
): ProvenAgentOperationalState {
  switch (status) {
    case "active":
    case "inactive":
    case "suspended":
    case "pending":
    case "unknown":
      return status;
    default:
      return "unknown";
  }
}
