/**
 * Phase 5J — harness-safe summary + overall status mapping.
 * Never includes password, token, email, phone, or broad UID dumps.
 */

import type { Phase5JFixtureStatus } from "@/application/controlled-writes/pilot/Phase5JFixtureStateMachine";
import {
  isPhase5JPartialFailure,
  isPhase5JPilotReady,
} from "@/application/controlled-writes/pilot/Phase5JFixtureStateMachine";
import type { Phase5IProvisionResult } from "@/application/controlled-writes/pilot/SyntheticDriverProvisioningService";
import type { Phase5JIamPreflightResult } from "@/application/controlled-writes/pilot/Phase5JIamPreflight";
import { createPhase5JWriteCounter } from "@/application/controlled-writes/pilot/Phase5JExpectedWriteCounts";

export type Phase5JHarnessOverallStatus =
  | "SKIPPED"
  | "GATED_REFUSED"
  | "IAM_PREFLIGHT_FAILED"
  | "PARTIAL_FAILURE"
  | "PROVISIONED_NOT_VERIFIED"
  | "PILOT_READY";

export type Phase5JHarnessSafeSummary = {
  overallStatus: Phase5JHarnessOverallStatus;
  harnessArmed: boolean;
  gatesOk: boolean;
  iamPreflightOk: boolean;
  missingPermissions: readonly string[];
  provisionAttempted: boolean;
  fixtureState: Phase5JFixtureStatus | "none";
  authCreateInvocationCount: number;
  firestoreCreateInvocationCount: number;
  claimVerificationReadCount: number;
  authWrites: number;
  firestoreWrites: number;
  claimWrites: number;
  auditWrites: number;
  idempotencyWrites: number;
  financeWrites: number;
  tripWrites: number;
  agentWrites: number;
  customerWrites: number;
  actualWrite: boolean;
  pilotReady: boolean;
  code?: string;
};

export function emptyPhase5JHarnessSafeSummary(
  overrides?: Partial<Phase5JHarnessSafeSummary>,
): Phase5JHarnessSafeSummary {
  return {
    overallStatus: "SKIPPED",
    harnessArmed: false,
    gatesOk: false,
    iamPreflightOk: false,
    missingPermissions: [],
    provisionAttempted: false,
    fixtureState: "none",
    authCreateInvocationCount: 0,
    firestoreCreateInvocationCount: 0,
    claimVerificationReadCount: 0,
    authWrites: 0,
    firestoreWrites: 0,
    claimWrites: 0,
    auditWrites: 0,
    idempotencyWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    actualWrite: false,
    pilotReady: false,
    ...overrides,
  };
}

/**
 * Map provision outcome → overallStatus.
 * PILOT_READY only when provision reports pilot_ready success.
 * Auth+Firestore created but verification incomplete → PROVISIONED_NOT_VERIFIED.
 * Partial failure states → PARTIAL_FAILURE.
 */
export function mapPhase5JProvisionToOverallStatus(
  result: Phase5IProvisionResult,
): Phase5JHarnessOverallStatus {
  if (result.ok && isPhase5JPilotReady(result.status)) {
    return "PILOT_READY";
  }
  const status = result.ok ? result.status : result.status;
  if (isPhase5JPartialFailure(status)) {
    return "PARTIAL_FAILURE";
  }
  if (
    status === "firestore_created" ||
    status === "claims_verified" ||
    status === "fixture_verified"
  ) {
    return "PROVISIONED_NOT_VERIFIED";
  }
  if (status === "auth_created") {
    return "PARTIAL_FAILURE";
  }
  // gated / ports / other denials without writes
  if (!result.ok && !result.actualWrite && result.writeCounts.authCreate === 0) {
    return "GATED_REFUSED";
  }
  return "PARTIAL_FAILURE";
}

export function summarizePhase5JProvisionResult(input: {
  harnessArmed: boolean;
  gatesOk: boolean;
  iam: Phase5JIamPreflightResult | null;
  provisionAttempted: boolean;
  result: Phase5IProvisionResult | null;
  claimVerificationReadCount?: number;
}): Phase5JHarnessSafeSummary {
  if (!input.harnessArmed) {
    return emptyPhase5JHarnessSafeSummary({
      overallStatus: "SKIPPED",
      harnessArmed: false,
      code: "PHASE5J_PROVISION_SKIP",
    });
  }

  if (!input.gatesOk) {
    return emptyPhase5JHarnessSafeSummary({
      overallStatus: "GATED_REFUSED",
      harnessArmed: true,
      gatesOk: false,
      code:
        input.result && !input.result.ok
          ? input.result.code
          : "PROVISIONING_WRITE_DISABLED",
    });
  }

  if (input.iam && !input.iam.ok) {
    return emptyPhase5JHarnessSafeSummary({
      overallStatus: "IAM_PREFLIGHT_FAILED",
      harnessArmed: true,
      gatesOk: true,
      iamPreflightOk: false,
      missingPermissions: input.iam.missingPermissions,
      provisionAttempted: false,
      code: input.iam.code,
    });
  }

  const zeros = createPhase5JWriteCounter();
  const wc = input.result?.writeCounts ?? zeros;
  const fixtureState: Phase5JFixtureStatus | "none" = input.result
    ? input.result.status
    : "none";
  const overall = input.result
    ? mapPhase5JProvisionToOverallStatus(input.result)
    : "GATED_REFUSED";

  return {
    overallStatus: overall,
    harnessArmed: true,
    gatesOk: true,
    iamPreflightOk: input.iam?.ok === true,
    missingPermissions: [],
    provisionAttempted: input.provisionAttempted,
    fixtureState,
    authCreateInvocationCount: wc.authCreate,
    firestoreCreateInvocationCount: wc.firestoreUserCreates,
    claimVerificationReadCount: input.claimVerificationReadCount ?? 0,
    authWrites: wc.authCreate,
    firestoreWrites: wc.firestoreUserCreates,
    claimWrites: wc.claimsSetCustomUserClaims,
    auditWrites: wc.auditWrites,
    idempotencyWrites: wc.idempotencyWrites,
    financeWrites: wc.financeWrites,
    tripWrites: wc.tripWrites,
    agentWrites: wc.agentWrites,
    customerWrites: wc.customerWrites,
    actualWrite: input.result?.actualWrite ?? false,
    pilotReady: overall === "PILOT_READY",
    code: input.result && !input.result.ok ? input.result.code : undefined,
  };
}
