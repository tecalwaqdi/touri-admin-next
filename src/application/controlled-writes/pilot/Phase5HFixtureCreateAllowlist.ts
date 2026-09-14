/**
 * Phase 5H — typed create allowlist + expected future write counts.
 * PREPARATION ONLY. Prep session all counts = 0.
 * No Record<string, unknown> arbitrary payloads.
 */

import {
  PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
  AUTH_REQUIRED_FOR_FIXTURE,
  FIXTURE_CREATION_NO_GO,
} from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";
import {
  PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC,
  type Phase5HSyntheticDriverFixtureDoc,
} from "@/application/controlled-writes/pilot/Phase5HSyntheticDriverFixtureSchema";

export type Phase5HFixtureCreateAllowlist = {
  readonly collection: "user";
  readonly documentId: typeof PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID;
  readonly mode: "create_only";
  readonly merge: false;
  readonly overwrite: false;
  readonly arbitraryPayloadAllowed: false;
  readonly fields: Phase5HSyntheticDriverFixtureDoc;
  readonly AUTH_REQUIRED_FOR_FIXTURE: typeof AUTH_REQUIRED_FOR_FIXTURE;
  readonly FIXTURE_CREATION_NO_GO: typeof FIXTURE_CREATION_NO_GO;
};

export const PHASE_5H_FIXTURE_CREATE_ALLOWLIST: Phase5HFixtureCreateAllowlist = {
  collection: "user",
  documentId: PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
  mode: "create_only",
  merge: false,
  overwrite: false,
  arbitraryPayloadAllowed: false,
  fields: PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC,
  AUTH_REQUIRED_FOR_FIXTURE,
  FIXTURE_CREATION_NO_GO,
};

export type Phase5HExpectedWriteCounts = {
  readonly fixtureDomainWrites: number;
  readonly auditWrites: number;
  readonly idempotencyWrites: number;
  readonly triggerSideEffectWrites: number;
  readonly authWrites: number;
  readonly financeWrites: number;
  readonly tripWrites: number;
};

/** Prep / dry-run session — all zero. */
export const PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION: Phase5HExpectedWriteCounts =
  {
    fixtureDomainWrites: 0,
    auditWrites: 0,
    idempotencyWrites: 0,
    triggerSideEffectWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
  };

/**
 * Hypothetical future create IF Auth blocker were resolved WITHOUT creating
 * Auth in this phase (currently NO-GO). Documented for operator awareness only.
 *
 * - fixtureDomainWrites: 1 (user/{id} create)
 * - auditWrites: 1 INTENT + 1 RESULT = 2 (if Admin Next audit path used)
 * - idempotencyWrites: 1
 * - triggerSideEffectWrites: 1 (syncUserClaimsOnWrite invocation)
 * - authWrites: 1 (setCustomUserClaims) IF Auth user already existed;
 *   OR authWrites: 0 with CF failure if Auth missing (NO-GO)
 * - financeWrites / tripWrites: 0
 */
export const PHASE_5H_EXPECTED_WRITE_COUNTS_FUTURE_CREATE_IF_UNBLOCKED: Phase5HExpectedWriteCounts =
  {
    fixtureDomainWrites: 1,
    auditWrites: 2,
    idempotencyWrites: 1,
    triggerSideEffectWrites: 1,
    authWrites: 1,
    financeWrites: 0,
    tripWrites: 0,
  };

/** While FIXTURE_CREATION_NO_GO — future create counts remain blocked zeros. */
export const PHASE_5H_EXPECTED_WRITE_COUNTS_FUTURE_CREATE_BLOCKED: Phase5HExpectedWriteCounts =
  {
    fixtureDomainWrites: 0,
    auditWrites: 0,
    idempotencyWrites: 0,
    triggerSideEffectWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
  };

export function assertCreateAllowlistTyped(
  allowlist: Phase5HFixtureCreateAllowlist = PHASE_5H_FIXTURE_CREATE_ALLOWLIST,
): boolean {
  if (allowlist.arbitraryPayloadAllowed !== false) return false;
  if (allowlist.merge !== false || allowlist.overwrite !== false) return false;
  if (allowlist.mode !== "create_only") return false;
  if (allowlist.collection !== "user") return false;
  if (allowlist.documentId !== PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID) {
    return false;
  }
  const f = allowlist.fields;
  return (
    f.ismndob === true &&
    f.registration_status === "pending_review" &&
    f.actev_mndob === false &&
    f.is_test === true &&
    f.functional_test === true &&
    f.qa_fixture === true &&
    f.on_trip === false &&
    f.mndon_newacc === false
  );
}
