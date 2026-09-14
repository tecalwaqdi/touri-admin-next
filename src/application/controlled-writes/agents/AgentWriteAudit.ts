/**
 * Phase 5B — Audit intent / result for Agent Controlled Writes.
 * Safe fields only — no PII (phone/email/IBAN/bank/contracts/address/docs).
 */

import type { Role } from "@/types/roles";
import { assertAuditPayloadHasNoRawPii } from "@/application/controlled-writes/ControlledWriteAudit";
import type {
  AgentControlledWriteAction,
  ProvenAgentOperationalState,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";

export type AgentWriteAuditIntent = {
  kind: "AUDIT_INTENT";
  auditId: string;
  actorUid: string;
  actorRole: Role;
  resource: "agent";
  action: AgentControlledWriteAction;
  agentId: string;
  countryId: string | null;
  countryScopeKind: string;
  fromState: ProvenAgentOperationalState;
  toState: ProvenAgentOperationalState;
  reasonCode?: string;
  idempotencyKey: string;
  correlationId: string;
  productionWriteExecuted: false;
  createdAtUtc: string;
};

export type AgentWriteAuditResult = {
  kind: "AUDIT_RESULT";
  auditId: string;
  intentAuditId: string;
  outcome: "applied" | "denied" | "failed" | "idempotent_replay";
  code?: string;
  resource: "agent";
  action: AgentControlledWriteAction;
  agentId: string;
  countryId: string | null;
  fromState?: ProvenAgentOperationalState;
  toState?: ProvenAgentOperationalState;
  idempotencyKey: string;
  correlationId: string;
  productionWriteExecuted: false;
  createdAtUtc: string;
};

export type AgentWriteAuditPort = {
  recordIntent(intent: AgentWriteAuditIntent): Promise<void>;
  recordResult(result: AgentWriteAuditResult): Promise<void>;
};

export class InMemoryAgentWriteAuditPort implements AgentWriteAuditPort {
  intents: AgentWriteAuditIntent[] = [];
  results: AgentWriteAuditResult[] = [];

  async recordIntent(intent: AgentWriteAuditIntent): Promise<void> {
    this.intents.push(intent);
  }

  async recordResult(result: AgentWriteAuditResult): Promise<void> {
    this.results.push(result);
  }
}

function auditId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function guardNoPii(payload: unknown): void {
  const check = assertAuditPayloadHasNoRawPii(payload);
  if (!check.ok) {
    throw new AgentWriteError(
      "INTERNAL_WRITE_FAILURE",
      `Audit PII violation: ${check.violations.join(",")}`,
    );
  }
}

export function buildAgentWriteAuditIntent(input: {
  actorUid: string;
  actorRole: Role;
  action: AgentControlledWriteAction;
  agentId: string;
  countryId: string | null;
  countryScopeKind: string;
  fromState: ProvenAgentOperationalState;
  toState: ProvenAgentOperationalState;
  reasonCode?: string;
  idempotencyKey: string;
  correlationId: string;
}): AgentWriteAuditIntent {
  const intent: AgentWriteAuditIntent = {
    kind: "AUDIT_INTENT",
    auditId: auditId("awi"),
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    resource: "agent",
    action: input.action,
    agentId: input.agentId,
    countryId: input.countryId,
    countryScopeKind: input.countryScopeKind,
    fromState: input.fromState,
    toState: input.toState,
    reasonCode: input.reasonCode,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    productionWriteExecuted: false,
    createdAtUtc: new Date().toISOString(),
  };
  guardNoPii(intent);
  return intent;
}

export function buildAgentWriteAuditResult(input: {
  intentAuditId: string;
  outcome: AgentWriteAuditResult["outcome"];
  code?: string;
  action: AgentControlledWriteAction;
  agentId: string;
  countryId: string | null;
  fromState?: ProvenAgentOperationalState;
  toState?: ProvenAgentOperationalState;
  idempotencyKey: string;
  correlationId: string;
}): AgentWriteAuditResult {
  const result: AgentWriteAuditResult = {
    kind: "AUDIT_RESULT",
    auditId: auditId("awr"),
    intentAuditId: input.intentAuditId,
    outcome: input.outcome,
    code: input.code,
    resource: "agent",
    action: input.action,
    agentId: input.agentId,
    countryId: input.countryId,
    fromState: input.fromState,
    toState: input.toState,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    productionWriteExecuted: false,
    createdAtUtc: new Date().toISOString(),
  };
  guardNoPii(result);
  return result;
}
