/**
 * Phase 5C — Audit intent / result for Customer Controlled Writes.
 * Safe fields only — no PII (phone/email/FCM/national ID/address/display names).
 */

import type { Role } from "@/types/roles";
import { assertAuditPayloadHasNoRawPii } from "@/application/controlled-writes/ControlledWriteAudit";
import type {
  CustomerControlledWriteAction,
  ProvenCustomerOperationalState,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

export type CustomerWriteAuditIntent = {
  kind: "AUDIT_INTENT";
  auditId: string;
  actorUid: string;
  actorRole: Role;
  resource: "customer";
  action: CustomerControlledWriteAction;
  customerId: string;
  countryId: string | null;
  countryScopeKind: string;
  fromState: ProvenCustomerOperationalState;
  toState: ProvenCustomerOperationalState;
  reasonCode?: string;
  idempotencyKey: string;
  correlationId: string;
  productionWriteExecuted: false;
  authWriteExecuted: false;
  createdAtUtc: string;
};

export type CustomerWriteAuditResult = {
  kind: "AUDIT_RESULT";
  auditId: string;
  intentAuditId: string;
  outcome: "applied" | "denied" | "failed" | "idempotent_replay";
  code?: string;
  resource: "customer";
  action: CustomerControlledWriteAction;
  customerId: string;
  countryId: string | null;
  fromState?: ProvenCustomerOperationalState;
  toState?: ProvenCustomerOperationalState;
  idempotencyKey: string;
  correlationId: string;
  productionWriteExecuted: false;
  authWriteExecuted: false;
  createdAtUtc: string;
};

export type CustomerWriteAuditPort = {
  recordIntent(intent: CustomerWriteAuditIntent): Promise<void>;
  recordResult(result: CustomerWriteAuditResult): Promise<void>;
};

export class InMemoryCustomerWriteAuditPort implements CustomerWriteAuditPort {
  intents: CustomerWriteAuditIntent[] = [];
  results: CustomerWriteAuditResult[] = [];

  async recordIntent(intent: CustomerWriteAuditIntent): Promise<void> {
    this.intents.push(intent);
  }

  async recordResult(result: CustomerWriteAuditResult): Promise<void> {
    this.results.push(result);
  }
}

function auditId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function guardNoPii(payload: unknown): void {
  const check = assertAuditPayloadHasNoRawPii(payload);
  if (!check.ok) {
    throw new CustomerWriteError(
      "INTERNAL_WRITE_FAILURE",
      `Audit PII violation: ${check.violations.join(",")}`,
    );
  }
}

export function buildCustomerWriteAuditIntent(input: {
  actorUid: string;
  actorRole: Role;
  action: CustomerControlledWriteAction;
  customerId: string;
  countryId: string | null;
  countryScopeKind: string;
  fromState: ProvenCustomerOperationalState;
  toState: ProvenCustomerOperationalState;
  reasonCode?: string;
  idempotencyKey: string;
  correlationId: string;
}): CustomerWriteAuditIntent {
  const intent: CustomerWriteAuditIntent = {
    kind: "AUDIT_INTENT",
    auditId: auditId("cwi"),
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    resource: "customer",
    action: input.action,
    customerId: input.customerId,
    countryId: input.countryId,
    countryScopeKind: input.countryScopeKind,
    fromState: input.fromState,
    toState: input.toState,
    reasonCode: input.reasonCode,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    productionWriteExecuted: false,
    authWriteExecuted: false,
    createdAtUtc: new Date().toISOString(),
  };
  guardNoPii(intent);
  return intent;
}

export function buildCustomerWriteAuditResult(input: {
  intentAuditId: string;
  outcome: CustomerWriteAuditResult["outcome"];
  code?: string;
  action: CustomerControlledWriteAction;
  customerId: string;
  countryId: string | null;
  fromState?: ProvenCustomerOperationalState;
  toState?: ProvenCustomerOperationalState;
  idempotencyKey: string;
  correlationId: string;
}): CustomerWriteAuditResult {
  const result: CustomerWriteAuditResult = {
    kind: "AUDIT_RESULT",
    auditId: auditId("cwr"),
    intentAuditId: input.intentAuditId,
    outcome: input.outcome,
    code: input.code,
    resource: "customer",
    action: input.action,
    customerId: input.customerId,
    countryId: input.countryId,
    fromState: input.fromState,
    toState: input.toState,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    productionWriteExecuted: false,
    authWriteExecuted: false,
    createdAtUtc: new Date().toISOString(),
  };
  guardNoPii(result);
  return result;
}
