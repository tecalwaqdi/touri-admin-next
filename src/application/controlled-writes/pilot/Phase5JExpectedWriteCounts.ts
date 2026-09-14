/**
 * Phase 5J — exact expected write counts for ONE successful provision.
 * Codify exact equality (not >=). Finance/trip/agent/customer = 0.
 */

import type { Phase5IExpectedWriteCounts } from "@/application/controlled-writes/pilot/Phase5IExpectedWriteCounts";
import { PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION } from "@/application/controlled-writes/pilot/Phase5IExpectedWriteCounts";

export type Phase5JWriteCounts = Phase5IExpectedWriteCounts;

/** Exact counts for ONE successful Auth-safe provision. */
export const PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS: Phase5JWriteCounts = {
  authCreate: 1,
  firestoreUserCreates: 1,
  claimsSetCustomUserClaims: 1,
  auditWrites: 2,
  idempotencyWrites: 1,
  triggerInvocations: 1,
  financeWrites: 0,
  tripWrites: 0,
  agentWrites: 0,
  customerWrites: 0,
};

/** Session / gated refusal / SKIP — all zeros. */
export const PHASE_5J_EXPECTED_WRITE_COUNTS_DISABLED: Phase5JWriteCounts = {
  authCreate: 0,
  firestoreUserCreates: 0,
  claimsSetCustomUserClaims: 0,
  auditWrites: 0,
  idempotencyWrites: 0,
  triggerInvocations: 0,
  financeWrites: 0,
  tripWrites: 0,
  agentWrites: 0,
  customerWrites: 0,
};

/** Alias — same contract as Phase 5I future provision design. */
export const PHASE_5J_ALIGNED_WITH_5I_FUTURE =
  PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION;

export function assertExactPhase5JSuccessWriteCounts(
  actual: Phase5JWriteCounts,
): { ok: true } | { ok: false; mismatches: string[] } {
  const expected = PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS;
  const mismatches: string[] = [];
  for (const key of Object.keys(expected) as (keyof Phase5JWriteCounts)[]) {
    if (actual[key] !== expected[key]) {
      mismatches.push(`${key}: expected ${expected[key]} got ${actual[key]}`);
    }
  }
  return mismatches.length === 0 ? { ok: true } : { ok: false, mismatches };
}

export type Phase5JWriteCounter = {
  authCreate: number;
  firestoreUserCreates: number;
  claimsSetCustomUserClaims: number;
  auditWrites: number;
  idempotencyWrites: number;
  triggerInvocations: number;
  financeWrites: number;
  tripWrites: number;
  agentWrites: number;
  customerWrites: number;
};

export function createPhase5JWriteCounter(): Phase5JWriteCounter {
  return {
    authCreate: 0,
    firestoreUserCreates: 0,
    claimsSetCustomUserClaims: 0,
    auditWrites: 0,
    idempotencyWrites: 0,
    triggerInvocations: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
  };
}
