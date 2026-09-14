/**
 * Phase 5D — normalized audit model across Driver / Agent / Customer.
 * Domain-specific safe fields allowed; raw PII / secrets / finance payloads forbidden.
 */

import type { Role } from "@/types/roles";
import {
  assertAuditPayloadHasNoRawPii,
  createAuditId,
} from "@/application/controlled-writes/ControlledWriteAudit";
import { ControlledWriteConsolidationError } from "@/application/controlled-writes/ControlledWriteErrorCatalog";

export type ConsolidatedAuditResource = "driver" | "agent" | "customer";

export type ConsolidatedAuditIntent = {
  kind: "consolidated_write_intent";
  auditId: string;
  actorUid: string;
  actorRole: Role;
  resourceType: ConsolidatedAuditResource;
  resourceId: string;
  action: string;
  requestId: string;
  idempotencyReference: string;
  beforeStateHash: string;
  domainSafe?: Record<string, string | boolean | number | null>;
  timestamp: string;
  productionWriteExecuted: false;
};

export type ConsolidatedAuditResult = {
  kind: "consolidated_write_result";
  auditId: string;
  intentAuditId: string;
  actorUid: string;
  actorRole: Role;
  resourceType: ConsolidatedAuditResource;
  resourceId: string;
  action: string;
  requestId: string;
  idempotencyReference: string;
  beforeStateHash: string;
  afterStateHash: string;
  result: "applied" | "denied" | "failed" | "idempotent_replay";
  failureCode?: string;
  timestamp: string;
  productionWriteExecuted: false;
};

export type ConsolidatedAuditPort = {
  recordIntent(intent: ConsolidatedAuditIntent): Promise<void>;
  recordResult(result: ConsolidatedAuditResult): Promise<void>;
};

export class InMemoryConsolidatedAuditPort implements ConsolidatedAuditPort {
  intents: ConsolidatedAuditIntent[] = [];
  results: ConsolidatedAuditResult[] = [];

  async recordIntent(intent: ConsolidatedAuditIntent): Promise<void> {
    this.intents.push(intent);
  }

  async recordResult(result: ConsolidatedAuditResult): Promise<void> {
    this.results.push(result);
  }

  clear(): void {
    this.intents = [];
    this.results = [];
  }
}

function guardNoPii(payload: unknown): void {
  const check = assertAuditPayloadHasNoRawPii(payload);
  if (!check.ok) {
    throw new ControlledWriteConsolidationError(
      "INTERNAL_WRITE_FAILURE",
      `Consolidated audit PII violation: ${check.violations.join(",")}`,
    );
  }
}

/** Stable non-PII state summary hash (opaque string, not cryptographic). */
export function hashStateSummary(
  parts: Array<string | boolean | number | null | undefined>,
): string {
  return parts.map((p) => (p == null ? "" : String(p))).join(":");
}

export function buildConsolidatedAuditIntent(input: {
  actorUid: string;
  actorRole: Role;
  resourceType: ConsolidatedAuditResource;
  resourceId: string;
  action: string;
  requestId: string;
  idempotencyReference: string;
  beforeStateHash: string;
  domainSafe?: Record<string, string | boolean | number | null>;
}): ConsolidatedAuditIntent {
  const intent: ConsolidatedAuditIntent = {
    kind: "consolidated_write_intent",
    auditId: createAuditId("cwi5d"),
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    requestId: input.requestId,
    idempotencyReference: input.idempotencyReference,
    beforeStateHash: input.beforeStateHash,
    domainSafe: input.domainSafe,
    timestamp: new Date().toISOString(),
    productionWriteExecuted: false,
  };
  guardNoPii(intent);
  return intent;
}

export function buildConsolidatedAuditResult(input: {
  intentAuditId: string;
  actorUid: string;
  actorRole: Role;
  resourceType: ConsolidatedAuditResource;
  resourceId: string;
  action: string;
  requestId: string;
  idempotencyReference: string;
  beforeStateHash: string;
  afterStateHash: string;
  result: ConsolidatedAuditResult["result"];
  failureCode?: string;
}): ConsolidatedAuditResult {
  const result: ConsolidatedAuditResult = {
    kind: "consolidated_write_result",
    auditId: createAuditId("cwr5d"),
    intentAuditId: input.intentAuditId,
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    requestId: input.requestId,
    idempotencyReference: input.idempotencyReference,
    beforeStateHash: input.beforeStateHash,
    afterStateHash: input.afterStateHash,
    result: input.result,
    failureCode: input.failureCode,
    timestamp: new Date().toISOString(),
    productionWriteExecuted: false,
  };
  guardNoPii(result);
  return result;
}
