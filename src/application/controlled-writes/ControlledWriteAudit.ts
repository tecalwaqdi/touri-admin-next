/**
 * Phase 5 — Controlled Write audit contracts (no raw PII).
 * Intent recorded before repository call; result after.
 */

import type { Role } from "@/types/roles";
import type {
  ControlledWriteAction,
  ControlledWriteResource,
} from "@/application/controlled-writes/ControlledWriteTypes";

const FORBIDDEN_AUDIT_KEYS = [
  "phone",
  "email",
  "fcm",
  "nationalId",
  "iban",
  "address",
  "storageUrl",
  "photoUrl",
  "displayName",
  "fullName",
] as const;

export type ControlledWriteAuditIntent = {
  kind: "controlled_write_intent";
  auditId: string;
  actorUid: string;
  actorRole: Role;
  resource: ControlledWriteResource;
  action: ControlledWriteAction;
  resourceId: string;
  countryId: string;
  idempotencyKey: string;
  correlationId: string;
  reasonCode?: string;
  /** Safe before snapshot — ids/status enums only. */
  beforeSafe?: Record<string, string | boolean | number | null>;
  createdAtUtc: string;
};

export type ControlledWriteAuditResult = {
  kind: "controlled_write_result";
  auditId: string;
  intentAuditId: string;
  outcome: "applied" | "denied" | "failed" | "idempotent_replay";
  code?: string;
  resource: ControlledWriteResource;
  action: ControlledWriteAction;
  resourceId: string;
  countryId: string;
  idempotencyKey: string;
  correlationId: string;
  /** Safe after snapshot — ids/status enums only. */
  afterSafe?: Record<string, string | boolean | number | null>;
  productionWriteExecuted: false;
  createdAtUtc: string;
};

export function createAuditId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function assertAuditPayloadHasNoRawPii(
  payload: unknown,
): { ok: true } | { ok: false; violations: string[] } {
  const serialized = JSON.stringify(payload ?? {});
  const violations: string[] = [];

  for (const key of FORBIDDEN_AUDIT_KEYS) {
    // Flag only JSON keys, not accidental substrings in ids.
    if (new RegExp(`"${key}"\\s*:`, "i").test(serialized)) {
      violations.push(`forbidden_key:${key}`);
    }
  }

  // Inspect each value independently: a random identifier containing "tel"
  // plus an unrelated ISO date must not turn a legitimate audit into a failure.
  const containsPhone = (value: unknown): boolean => {
    if (typeof value === "string") {
      return /\b(?:phone|tel|mobile)\b/i.test(value) && /\+?\d[\d\s-]{8,}\d/.test(value);
    }
    return value != null && typeof value === "object" && Object.values(value).some(containsPhone);
  };
  if (containsPhone(payload)) {
    violations.push("raw_phone_pattern");
  }
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(serialized)) {
    violations.push("raw_email_pattern");
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

export function buildAuditIntent(input: {
  actorUid: string;
  actorRole: Role;
  resource: ControlledWriteResource;
  action: ControlledWriteAction;
  resourceId: string;
  countryId: string;
  idempotencyKey: string;
  correlationId: string;
  reasonCode?: string;
  beforeSafe?: Record<string, string | boolean | number | null>;
}): ControlledWriteAuditIntent {
  const intent: ControlledWriteAuditIntent = {
    kind: "controlled_write_intent",
    auditId: createAuditId("cwi"),
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    resource: input.resource,
    action: input.action,
    resourceId: input.resourceId,
    countryId: input.countryId,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    reasonCode: input.reasonCode,
    beforeSafe: input.beforeSafe,
    createdAtUtc: new Date().toISOString(),
  };
  const pii = assertAuditPayloadHasNoRawPii(intent);
  if (!pii.ok) {
    throw new Error(`Audit intent PII violation: ${pii.violations.join(",")}`);
  }
  return intent;
}

export function buildAuditResult(input: {
  intentAuditId: string;
  outcome: ControlledWriteAuditResult["outcome"];
  code?: string;
  resource: ControlledWriteResource;
  action: ControlledWriteAction;
  resourceId: string;
  countryId: string;
  idempotencyKey: string;
  correlationId: string;
  afterSafe?: Record<string, string | boolean | number | null>;
}): ControlledWriteAuditResult {
  const result: ControlledWriteAuditResult = {
    kind: "controlled_write_result",
    auditId: createAuditId("cwr"),
    intentAuditId: input.intentAuditId,
    outcome: input.outcome,
    code: input.code,
    resource: input.resource,
    action: input.action,
    resourceId: input.resourceId,
    countryId: input.countryId,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    afterSafe: input.afterSafe,
    productionWriteExecuted: false,
    createdAtUtc: new Date().toISOString(),
  };
  const pii = assertAuditPayloadHasNoRawPii(result);
  if (!pii.ok) {
    throw new Error(`Audit result PII violation: ${pii.violations.join(",")}`);
  }
  return result;
}
