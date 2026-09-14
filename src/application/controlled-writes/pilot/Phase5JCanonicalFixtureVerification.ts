/**
 * Phase 5J — canonical fixture verification + bounded side-effect checks.
 * Canonical: driver, operational, synthetic, pending_review,
 * accountEnabled=false, no active trip.
 * Side effects: no finance/trip/agent/customer/comms writes observed.
 */

import {
  assertPhase5IMembershipAndSynthetic,
  PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC,
} from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import type { Phase5JWriteCounter } from "@/application/controlled-writes/pilot/Phase5JExpectedWriteCounts";

export type Phase5JCanonicalVerifyResult =
  | {
      ok: true;
      authoritativeRole: "driver";
      operationalDriver: true;
      synthetic: true;
      registrationStatus: "pending_review";
      accountEnabled: false;
      activeTrip: false;
      safePilotEligible: true;
    }
  | {
      ok: false;
      code: "CANONICAL_FIXTURE_VERIFICATION_FAILED";
      message: string;
    };

export function verifyPhase5JCanonicalFixture(input: {
  uid: string;
  data?: Record<string, unknown>;
}): Phase5JCanonicalVerifyResult {
  try {
    const data =
      (input.data as typeof PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC | undefined) ??
      PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC;
    const membership = assertPhase5IMembershipAndSynthetic({
      documentId: input.uid,
      data,
    });

    const asRecord = data as unknown as Record<string, unknown>;
    if (asRecord.actev_mndob !== false) {
      return {
        ok: false,
        code: "CANONICAL_FIXTURE_VERIFICATION_FAILED",
        message: "accountEnabled must be false (actev_mndob=false)",
      };
    }
    if (asRecord.on_trip !== false) {
      return {
        ok: false,
        code: "CANONICAL_FIXTURE_VERIFICATION_FAILED",
        message: "active trip forbidden (on_trip must be false)",
      };
    }
    if (asRecord.registration_status !== "pending_review") {
      return {
        ok: false,
        code: "CANONICAL_FIXTURE_VERIFICATION_FAILED",
        message: "registration_status must be pending_review",
      };
    }

    return {
      ok: true,
      authoritativeRole: "driver",
      operationalDriver: true,
      synthetic: true,
      registrationStatus: "pending_review",
      accountEnabled: false,
      activeTrip: false,
      safePilotEligible: membership.safePilotEligible,
    };
  } catch (err) {
    return {
      ok: false,
      code: "CANONICAL_FIXTURE_VERIFICATION_FAILED",
      message: err instanceof Error ? err.message : "canonical verification failed",
    };
  }
}

export type Phase5JSideEffectCheckResult =
  | {
      ok: true;
      financeWrites: 0;
      tripWrites: 0;
      agentWrites: 0;
      customerWrites: 0;
      communicationWrites: 0;
    }
  | {
      ok: false;
      code: "UNEXPECTED_SIDE_EFFECTS";
      message: string;
    };

/**
 * Bounded side-effect check against write counter (no finance/trip/agent/customer/comms).
 */
export function verifyPhase5JSideEffects(
  counter: Phase5JWriteCounter,
  communicationWrites = 0,
): Phase5JSideEffectCheckResult {
  if (
    counter.financeWrites !== 0 ||
    counter.tripWrites !== 0 ||
    counter.agentWrites !== 0 ||
    counter.customerWrites !== 0 ||
    communicationWrites !== 0
  ) {
    return {
      ok: false,
      code: "UNEXPECTED_SIDE_EFFECTS",
      message:
        "Finance/trip/agent/customer/communication writes must remain 0",
    };
  }
  return {
    ok: true,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    communicationWrites: 0,
  };
}
