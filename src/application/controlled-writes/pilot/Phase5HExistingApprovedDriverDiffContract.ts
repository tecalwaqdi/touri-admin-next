/**
 * Phase 5H pivot — exact SuspendDriverCommand / ProductionDriverWriteRepository
 * allowlist diffs for approved→suspended and rollback suspended→approved.
 * Structural only — does NOT execute writes.
 */

import {
  buildAllowlistedPatchForAction,
  planProductionDriverWriteTransaction,
  type ProductionDriverAllowlistedPatch,
  type ProductionDriverWriteTransactionPlan,
} from "@/application/controlled-writes/pilot/Phase5EProductionDriverWriteAllowlist";
import { resolveDriverTransition } from "@/application/controlled-writes/drivers/DriverStateMachine";
import type { ProvenDriverRegistrationState } from "@/application/controlled-writes/drivers/DriverWriteTypes";

/** Exact Firestore allowlist for SuspendDriverCommand (approved → suspended). */
export const PHASE_5H_SUSPEND_ALLOWLISTED_PATCH = {
  registration_status: "suspended",
} as const satisfies ProductionDriverAllowlistedPatch;

/** Exact Firestore allowlist for rollback ApproveDriverCommand (suspended → approved). */
export const PHASE_5H_ROLLBACK_APPROVE_ALLOWLISTED_PATCH = {
  registration_status: "approved",
} as const satisfies ProductionDriverAllowlistedPatch;

/**
 * Fields intentionally NOT in Production allowlist for suspend/approve.
 * FakeDriverWriteRepository also flips accountEnabled in-memory; Production
 * path does NOT write actev_mndob — documented availability caveat.
 */
export const PHASE_5H_SUSPEND_ROLLBACK_NON_ALLOWLIST_FIELDS = [
  "actev_mndob",
  "account_status",
  "is_online",
  "on_trip",
  "mndon_newacc",
  "Outstandingonlinepayment",
  "uid",
] as const;

export const PHASE_5H_SUSPEND_IDEMPOTENCY_KEY =
  "phase5h_existing_approved_suspend_v1" as const;

export const PHASE_5H_ROLLBACK_IDEMPOTENCY_KEY =
  "phase5h_existing_approved_rollback_approve_v1" as const;

export type Phase5HSuspendDiffPlan = {
  action: "suspend";
  fromState: "approved";
  toState: "suspended";
  patch: typeof PHASE_5H_SUSPEND_ALLOWLISTED_PATCH;
  allowlistedFields: readonly ["registration_status"];
  arbitraryPayloadAllowed: false;
  transitionOk: true;
  idempotencyKey: typeof PHASE_5H_SUSPEND_IDEMPOTENCY_KEY;
  /** Fake repo also sets accountEnabled=disabled — NOT in Production patch. */
  fakeRepoAlsoMutatesAccountEnabled: true;
  productionWritesActevMndob: false;
};

export type Phase5HRollbackDiffPlan = {
  action: "approve";
  fromState: "suspended";
  toState: "approved";
  patch: typeof PHASE_5H_ROLLBACK_APPROVE_ALLOWLISTED_PATCH;
  allowlistedFields: readonly ["registration_status"];
  arbitraryPayloadAllowed: false;
  transitionOk: true;
  idempotencyKey: typeof PHASE_5H_ROLLBACK_IDEMPOTENCY_KEY;
  fakeRepoAlsoMutatesAccountEnabled: true;
  productionWritesActevMndob: false;
  /**
   * approve from suspended does NOT hit pending_review compliance gate
   * (DriverWritePreconditions only checks compliance when from=pending_review).
   */
  approvalRevalidationRequired: false;
  /**
   * Auth CF still fires on rollback patch → rollbackSafe=false when Auth required=none.
   */
  authSideEffectOnRollback: true;
};

export function buildExactSuspendDiffPlan(): Phase5HSuspendDiffPlan {
  const resolved = resolveDriverTransition("suspend", "approved");
  if (!resolved.ok || resolved.to !== "suspended") {
    throw new Error("approved→suspended via suspend must be proven");
  }
  const patch = buildAllowlistedPatchForAction("suspend", "suspended");
  if (
    !("registration_status" in patch) ||
    patch.registration_status !== "suspended"
  ) {
    throw new Error("suspend allowlist must be registration_status=suspended");
  }
  // Typed constant is the allowlist SoT; runtime patch check above stays.
  const typedPatch: typeof PHASE_5H_SUSPEND_ALLOWLISTED_PATCH =
    PHASE_5H_SUSPEND_ALLOWLISTED_PATCH;
  return {
    action: "suspend",
    fromState: "approved",
    toState: "suspended",
    patch: typedPatch,
    allowlistedFields: ["registration_status"],
    arbitraryPayloadAllowed: false,
    transitionOk: true,
    idempotencyKey: PHASE_5H_SUSPEND_IDEMPOTENCY_KEY,
    fakeRepoAlsoMutatesAccountEnabled: true,
    productionWritesActevMndob: false,
  };
}

export function buildExactRollbackDiffPlan(): Phase5HRollbackDiffPlan {
  const resolved = resolveDriverTransition("approve", "suspended");
  if (!resolved.ok || resolved.to !== "approved") {
    throw new Error("suspended→approved via approve must be proven");
  }
  const patch = buildAllowlistedPatchForAction("approve", "approved");
  if (
    !("registration_status" in patch) ||
    patch.registration_status !== "approved"
  ) {
    throw new Error("rollback allowlist must be registration_status=approved");
  }
  const typedPatch: typeof PHASE_5H_ROLLBACK_APPROVE_ALLOWLISTED_PATCH =
    PHASE_5H_ROLLBACK_APPROVE_ALLOWLISTED_PATCH;
  return {
    action: "approve",
    fromState: "suspended",
    toState: "approved",
    patch: typedPatch,
    allowlistedFields: ["registration_status"],
    arbitraryPayloadAllowed: false,
    transitionOk: true,
    idempotencyKey: PHASE_5H_ROLLBACK_IDEMPOTENCY_KEY,
    fakeRepoAlsoMutatesAccountEnabled: true,
    productionWritesActevMndob: false,
    approvalRevalidationRequired: false,
    authSideEffectOnRollback: true,
  };
}

export function planSuspendTransaction(input: {
  driverId: string;
  preconditionToken: string;
}): ProductionDriverWriteTransactionPlan {
  return planProductionDriverWriteTransaction({
    action: "suspend",
    driverId: input.driverId,
    preconditionToken: input.preconditionToken,
    fromState: "approved" satisfies ProvenDriverRegistrationState,
    toState: "suspended",
  });
}

export function planRollbackTransaction(input: {
  driverId: string;
  preconditionToken: string;
}): ProductionDriverWriteTransactionPlan {
  return planProductionDriverWriteTransaction({
    action: "approve",
    driverId: input.driverId,
    preconditionToken: input.preconditionToken,
    fromState: "suspended",
    toState: "approved",
  });
}

export type Phase5HExpectedFutureWriteCounts = {
  domainWrites: number;
  auditWrites: number;
  idempotencyWrites: number;
  triggerSideEffectWrites: number;
  authWrites: number;
  financeWrites: number;
  tripWrites: number;
};

/** Hypothetical future suspend counts — NOT authorized; Auth>0 blocks GO. */
export const PHASE_5H_EXPECTED_FUTURE_SUSPEND_WRITE_COUNTS: Phase5HExpectedFutureWriteCounts =
  {
    domainWrites: 1,
    auditWrites: 2,
    idempotencyWrites: 1,
    triggerSideEffectWrites: 1,
    authWrites: 1,
    financeWrites: 0,
    tripWrites: 0,
  };

/** Hypothetical future rollback counts — same Auth side effect. */
export const PHASE_5H_EXPECTED_FUTURE_ROLLBACK_WRITE_COUNTS: Phase5HExpectedFutureWriteCounts =
  {
    domainWrites: 1,
    auditWrites: 2,
    idempotencyWrites: 1,
    triggerSideEffectWrites: 1,
    authWrites: 1,
    financeWrites: 0,
    tripWrites: 0,
  };

/** This qualification session / dry-run — all zeros. */
export const PHASE_5H_EXPECTED_QUALIFICATION_SESSION_WRITES: Phase5HExpectedFutureWriteCounts =
  {
    domainWrites: 0,
    auditWrites: 0,
    idempotencyWrites: 0,
    triggerSideEffectWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
  };
