/**
 * Phase 5J — write observability events per category (exact counts).
 */

import type { Phase5JWriteCounter } from "@/application/controlled-writes/pilot/Phase5JExpectedWriteCounts";
import {
  PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS,
  assertExactPhase5JSuccessWriteCounts,
} from "@/application/controlled-writes/pilot/Phase5JExpectedWriteCounts";

export type Phase5JObservabilityEvent = {
  readonly phase: "5J";
  readonly kind: "provision_observability";
  readonly requestId: string;
  readonly status: string;
  readonly writeCounts: Phase5JWriteCounter;
  readonly exactSuccessMatch: boolean;
  readonly productionWrites: number;
  readonly authWrites: number;
  readonly financeWrites: number;
  readonly tripWrites: number;
  readonly createdAtUtc: string;
};

export function toPhase5JObservabilityEvent(input: {
  requestId: string;
  status: string;
  writeCounts: Phase5JWriteCounter;
}): Phase5JObservabilityEvent {
  const exact = assertExactPhase5JSuccessWriteCounts(input.writeCounts);
  return {
    phase: "5J",
    kind: "provision_observability",
    requestId: input.requestId,
    status: input.status,
    writeCounts: { ...input.writeCounts },
    exactSuccessMatch: exact.ok,
    productionWrites: input.writeCounts.firestoreUserCreates,
    authWrites: input.writeCounts.authCreate,
    financeWrites: input.writeCounts.financeWrites,
    tripWrites: input.writeCounts.tripWrites,
    createdAtUtc: new Date().toISOString(),
  };
}

export function summarizePhase5JWriteCategories(
  counter: Phase5JWriteCounter,
): Record<string, number> {
  return {
    authCreate: counter.authCreate,
    firestoreUserCreates: counter.firestoreUserCreates,
    claimsSetCustomUserClaims: counter.claimsSetCustomUserClaims,
    triggerInvocations: counter.triggerInvocations,
    auditWrites: counter.auditWrites,
    idempotencyWrites: counter.idempotencyWrites,
    financeWrites: counter.financeWrites,
    tripWrites: counter.tripWrites,
    agentWrites: counter.agentWrites,
    customerWrites: counter.customerWrites,
    expectedAuthCreate: PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS.authCreate,
    expectedFirestore: PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS.firestoreUserCreates,
    expectedClaims:
      PHASE_5J_EXPECTED_WRITE_COUNTS_SUCCESS.claimsSetCustomUserClaims,
  };
}
