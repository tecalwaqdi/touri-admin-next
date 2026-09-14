/**
 * Phase 5L — idempotency + audit planning for needs_changes Pilot.
 * Plan only — do not persist idempotency or write audit records in dry-run.
 */

import { validateDriverIdempotencyKey } from "@/application/controlled-writes/drivers/DriverWriteIdempotency";

/** Logical Pilot operation key — separate from Phase 5J fixture provisioning. */
export const PHASE_5L_PILOT_IDEMPOTENCY_KEY =
  "phase5l_driver_needs_changes_pilot_v1" as const;

export type Phase5LIdempotencyPlan = {
  readonly idempotencyReady: true;
  readonly keyLogical: typeof PHASE_5L_PILOT_IDEMPOTENCY_KEY;
  readonly persisted: false;
  readonly writes: 0;
};

export type Phase5LAuditPlan = {
  readonly auditPlanReady: true;
  readonly auditIntent: 1;
  readonly auditResult: 1;
  readonly persisted: false;
  readonly writes: 0;
  /** Safe non-PII plan fields only. */
  readonly planned: {
    readonly resource: "driver";
    readonly action: "needs_changes";
    readonly actorRole: string;
    readonly fromState: "pending_review";
    readonly toState: "needs_changes";
  };
};

export function planPhase5LIdempotency(): Phase5LIdempotencyPlan {
  validateDriverIdempotencyKey(PHASE_5L_PILOT_IDEMPOTENCY_KEY);
  return {
    idempotencyReady: true,
    keyLogical: PHASE_5L_PILOT_IDEMPOTENCY_KEY,
    persisted: false,
    writes: 0,
  };
}

export function planPhase5LAudit(input: {
  actorRole: string;
}): Phase5LAuditPlan {
  return {
    auditPlanReady: true,
    auditIntent: 1,
    auditResult: 1,
    persisted: false,
    writes: 0,
    planned: {
      resource: "driver",
      action: "needs_changes",
      actorRole: input.actorRole,
      fromState: "pending_review",
      toState: "needs_changes",
    },
  };
}
