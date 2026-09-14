/**
 * Phase 5A — Audit intent / result for Driver Controlled Writes.
 * Safe fields only — no PII.
 */

import type { Role } from "@/types/roles";
import { assertAuditPayloadHasNoRawPii } from "@/application/controlled-writes/ControlledWriteAudit";
import type {
  DriverControlledWriteAction,
  ProvenDriverRegistrationState,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";

export type DriverWriteAuditIntent = {
  kind: "AUDIT_INTENT";
  auditId: string;
  actorUid: string;
  actorRole: Role;
  resource: "driver";
  action: DriverControlledWriteAction;
  driverId: string;
  countryId: string | null;
  countryScopeKind: string;
  fromState: ProvenDriverRegistrationState;
  toState: ProvenDriverRegistrationState;
  reasonCode?: string;
  idempotencyKey: string;
  correlationId: string;
  productionWriteExecuted: false;
  createdAtUtc: string;
};

export type DriverWriteAuditResult = {
  kind: "AUDIT_RESULT";
  auditId: string;
  intentAuditId: string;
  outcome: "applied" | "denied" | "failed" | "idempotent_replay";
  code?: string;
  resource: "driver";
  action: DriverControlledWriteAction;
  driverId: string;
  countryId: string | null;
  fromState?: ProvenDriverRegistrationState;
  toState?: ProvenDriverRegistrationState;
  idempotencyKey: string;
  correlationId: string;
  productionWriteExecuted: false;
  createdAtUtc: string;
};

export type DriverWriteAuditPort = {
  recordIntent(intent: DriverWriteAuditIntent): Promise<void>;
  recordResult(result: DriverWriteAuditResult): Promise<void>;
};

export class InMemoryDriverWriteAuditPort implements DriverWriteAuditPort {
  intents: DriverWriteAuditIntent[] = [];
  results: DriverWriteAuditResult[] = [];

  async recordIntent(intent: DriverWriteAuditIntent): Promise<void> {
    this.intents.push(intent);
  }

  async recordResult(result: DriverWriteAuditResult): Promise<void> {
    this.results.push(result);
  }
}

function auditId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function guardNoPii(payload: unknown): void {
  const check = assertAuditPayloadHasNoRawPii(payload);
  if (!check.ok) {
    throw new DriverWriteError(
      "INTERNAL_WRITE_FAILURE",
      `Audit PII violation: ${check.violations.join(",")}`,
    );
  }
}

export function buildDriverWriteAuditIntent(input: {
  actorUid: string;
  actorRole: Role;
  action: DriverControlledWriteAction;
  driverId: string;
  countryId: string | null;
  countryScopeKind: string;
  fromState: ProvenDriverRegistrationState;
  toState: ProvenDriverRegistrationState;
  reasonCode?: string;
  idempotencyKey: string;
  correlationId: string;
}): DriverWriteAuditIntent {
  const intent: DriverWriteAuditIntent = {
    kind: "AUDIT_INTENT",
    auditId: auditId("dwi"),
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    resource: "driver",
    action: input.action,
    driverId: input.driverId,
    countryId: input.countryId,
    countryScopeKind: input.countryScopeKind,
    fromState: input.fromState,
    toState: input.toState,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    productionWriteExecuted: false,
    createdAtUtc: new Date().toISOString(),
  };
  // Omit optional undefined — Firestore Admin rejects `code`/`reasonCode: undefined`.
  if (input.reasonCode !== undefined) intent.reasonCode = input.reasonCode;
  guardNoPii(intent);
  return intent;
}

export function buildDriverWriteAuditResult(input: {
  intentAuditId: string;
  outcome: DriverWriteAuditResult["outcome"];
  code?: string;
  action: DriverControlledWriteAction;
  driverId: string;
  countryId: string | null;
  fromState?: ProvenDriverRegistrationState;
  toState?: ProvenDriverRegistrationState;
  idempotencyKey: string;
  correlationId: string;
}): DriverWriteAuditResult {
  const result: DriverWriteAuditResult = {
    kind: "AUDIT_RESULT",
    auditId: auditId("dwr"),
    intentAuditId: input.intentAuditId,
    outcome: input.outcome,
    resource: "driver",
    action: input.action,
    driverId: input.driverId,
    countryId: input.countryId,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    productionWriteExecuted: false,
    createdAtUtc: new Date().toISOString(),
  };
  // Omit optional undefined — Phase 5M live failure: success RESULT had `code: undefined`.
  if (input.code !== undefined) result.code = input.code;
  if (input.fromState !== undefined) result.fromState = input.fromState;
  if (input.toState !== undefined) result.toState = input.toState;
  guardNoPii(result);
  return result;
}
