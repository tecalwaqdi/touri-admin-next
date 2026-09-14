/**
 * Phase 5J — typed allowlist command for Auth-safe synthetic Driver provision.
 * NOT Admin UI / route / menu. Arbitrary payload forbidden.
 */

import {
  PHASE_5I_CREATE_SEMANTICS,
} from "@/application/controlled-writes/pilot/Phase5IProvisioningOrder";
import {
  PHASE_5I_AUTH_CREATE_PROPERTIES,
  PHASE_5I_LOGICAL_FIXTURE_NAME,
} from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";
import {
  PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC,
  type Phase5ISyntheticDriverFirestoreDoc,
} from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import { PHASE_5I_EXPECTED_CUSTOM_CLAIMS } from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";

export const PHASE_5J_IDEMPOTENCY_KEY =
  PHASE_5I_CREATE_SEMANTICS.idempotencyKey;

export type ProvisionSyntheticDriverFixtureCommand = {
  readonly kind: "ProvisionSyntheticDriverFixture";
  readonly logicalFixtureName: typeof PHASE_5I_LOGICAL_FIXTURE_NAME;
  readonly idempotencyKey: typeof PHASE_5J_IDEMPOTENCY_KEY;
  readonly authCreate: typeof PHASE_5I_AUTH_CREATE_PROPERTIES;
  readonly firestoreDoc: Phase5ISyntheticDriverFirestoreDoc;
  readonly expectedClaims: typeof PHASE_5I_EXPECTED_CUSTOM_CLAIMS;
  readonly createOnly: true;
  readonly merge: false;
  readonly overwrite: false;
  readonly arbitraryPayloadAllowed: false;
  readonly requestId: string;
  readonly correlationId: string;
};

export function createProvisionSyntheticDriverFixtureCommand(input?: {
  requestId?: string;
  correlationId?: string;
}): ProvisionSyntheticDriverFixtureCommand {
  const requestId =
    input?.requestId?.trim() ||
    `phase5j_req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const correlationId = input?.correlationId?.trim() || requestId;
  return {
    kind: "ProvisionSyntheticDriverFixture",
    logicalFixtureName: PHASE_5I_LOGICAL_FIXTURE_NAME,
    idempotencyKey: PHASE_5J_IDEMPOTENCY_KEY,
    authCreate: PHASE_5I_AUTH_CREATE_PROPERTIES,
    firestoreDoc: PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC,
    expectedClaims: PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
    createOnly: true,
    merge: false,
    overwrite: false,
    arbitraryPayloadAllowed: false,
    requestId,
    correlationId,
  };
}
