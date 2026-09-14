/**
 * Phase 5K — offline fake read-only ports for unit tests.
 */

import type {
  Phase5KReadOnlyAuthPort,
  Phase5KReadOnlyFirestorePort,
  Phase5KReadOnlyPorts,
} from "@/application/controlled-writes/pilot/Phase5KReadOnlyFirebaseAdapters";
import type { Phase5KAuthUserRecord } from "@/application/controlled-writes/pilot/Phase5KAuthVerification";
import { PHASE_5I_EXPECTED_CUSTOM_CLAIMS } from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";
import { PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";

export function createPhase5KFakeReadOnlyPorts(input?: {
  authUser?: Phase5KAuthUserRecord | null;
  firestoreData?: Record<string, unknown> | null;
  preconditionToken?: string | null;
  uid?: string;
}): Phase5KReadOnlyPorts {
  const uid = input?.uid ?? "phase5k_offline_auth_shaped_uid_001";
  const readCounter = { productionReads: 0 };

  const defaultAuth: Phase5KAuthUserRecord = {
    uid,
    disabled: true,
    email: null,
    phoneNumber: null,
    displayName: null,
    photoURL: null,
    customClaims: { ...PHASE_5I_EXPECTED_CUSTOM_CLAIMS },
    providerDataCount: 0,
  };

  const auth: Phase5KReadOnlyAuthPort = {
    async getUser() {
      readCounter.productionReads += 1;
      if (input && "authUser" in input) return input.authUser ?? null;
      return defaultAuth;
    },
  };

  const firestore: Phase5KReadOnlyFirestorePort = {
    async getUserDoc() {
      readCounter.productionReads += 1;
      if (input && "firestoreData" in input && input.firestoreData === null) {
        return { exists: false, data: null, preconditionToken: null };
      }
      const data =
        input?.firestoreData ??
        (PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
          string,
          unknown
        >);
      return {
        exists: true,
        data,
        preconditionToken:
          input?.preconditionToken === undefined
            ? "tok_phase5k_offline"
            : input.preconditionToken,
      };
    },
  };

  return { auth, firestore, readCounter };
}
