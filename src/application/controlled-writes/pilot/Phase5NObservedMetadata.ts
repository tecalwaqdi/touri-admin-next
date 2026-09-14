/**
 * Phase 5N — observed Production metadata snapshot (safe / typed).
 * May include driverId internally for planning; safe summaries redact it.
 */

import type { ProvenDriverRegistrationState } from "@/application/controlled-writes/drivers/DriverWriteTypes";

export type Phase5NObservedAuditIntent = {
  readonly auditId: string;
  readonly kind: "AUDIT_INTENT";
  readonly action: string;
  readonly driverId: string;
  readonly countryId: string | null;
  readonly fromState: string;
  readonly toState: string;
  readonly reasonCode?: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly phase?: string;
  readonly createdAtUtc?: string;
};

export type Phase5NObservedAuditResult = {
  readonly auditId: string;
  readonly kind: "AUDIT_RESULT";
  readonly intentAuditId: string;
  readonly outcome: string;
  readonly code?: string;
  readonly action: string;
  readonly driverId: string;
  readonly countryId: string | null;
  readonly fromState?: string;
  readonly toState?: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly phase?: string;
  readonly createdAtUtc?: string;
  /** True if document literally stores `code: undefined` (should never). */
  readonly hasUndefinedCodeField?: boolean;
};

export type Phase5NObservedIdempotency = {
  readonly key: string;
  readonly fingerprint: string;
  readonly result: {
    readonly ok: boolean;
    readonly status: string;
    readonly action?: string;
    readonly driverId?: string;
    readonly fromState?: string;
    readonly toState?: string;
    readonly auditIntentId: string;
    readonly auditResultId: string;
    readonly productionWriteExecuted?: boolean;
  };
  readonly phase?: string;
  readonly createdAtUtc?: string;
};

export type Phase5NObservedAuth = {
  readonly exists: boolean;
  readonly disabled: boolean | null;
  readonly claimsKeys: readonly string[];
  readonly countryIdClaimPresent: boolean;
};

export type Phase5NObservedMetadata = {
  readonly driverState: ProvenDriverRegistrationState | string | null;
  readonly driverExists: boolean;
  readonly auditIntent: Phase5NObservedAuditIntent | null;
  readonly auditResults: readonly Phase5NObservedAuditResult[];
  readonly idempotency: Phase5NObservedIdempotency | null;
  readonly auth: Phase5NObservedAuth | null;
};
