/**
 * Phase 5H — create-only semantics, idempotency, preconditions.
 * No overwrite / merge. FIXTURE_ALREADY_EXISTS → refuse.
 * Does NOT execute create in Phase 5H.
 */

import { PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID } from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";
import {
  AUTH_REQUIRED_FOR_FIXTURE,
  FIXTURE_CREATION_NO_GO,
} from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";

export const PHASE_5H_FIXTURE_IDEMPOTENCY_KEY =
  "phase5h_create_synthetic_driver_fixture_v1" as const;

export type Phase5HFixtureCreateDenialCode =
  | "PHASE5H_FIXTURE_CREATE_SKIP"
  | "FIXTURE_CREATION_NO_GO"
  | "AUTH_REQUIRED_FOR_FIXTURE"
  | "FIXTURE_ALREADY_EXISTS"
  | "WRITE_FLAGS_MUST_REMAIN_FALSE"
  | "PROJECT_ID_MISMATCH"
  | "DOCUMENT_ID_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "PRECONDITION_FAILED";

export type Phase5HFixtureCreateSemantics = {
  readonly mode: "create_only";
  readonly merge: false;
  readonly overwrite: false;
  readonly applyToExisting: false;
  readonly onAlreadyExists: "FIXTURE_ALREADY_EXISTS";
  readonly idempotencyKey: typeof PHASE_5H_FIXTURE_IDEMPOTENCY_KEY;
  readonly documentId: typeof PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID;
};

export const PHASE_5H_FIXTURE_CREATE_SEMANTICS: Phase5HFixtureCreateSemantics = {
  mode: "create_only",
  merge: false,
  overwrite: false,
  applyToExisting: false,
  onAlreadyExists: "FIXTURE_ALREADY_EXISTS",
  idempotencyKey: PHASE_5H_FIXTURE_IDEMPOTENCY_KEY,
  documentId: PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
};

export type Phase5HFixtureCreatePreconditions = {
  readonly documentMustNotExist: true;
  readonly authUserCreateForbidden: true;
  readonly AUTH_REQUIRED_FOR_FIXTURE: typeof AUTH_REQUIRED_FOR_FIXTURE;
  readonly FIXTURE_CREATION_NO_GO: typeof FIXTURE_CREATION_NO_GO;
  readonly writeFlagsMustBeFalse: true;
  readonly operatorOnly: true;
  readonly adminUiForbidden: true;
  readonly financeForbidden: true;
  readonly tripForbidden: true;
  readonly pilotFlagsSeparate: true;
};

export const PHASE_5H_FIXTURE_CREATE_PRECONDITIONS: Phase5HFixtureCreatePreconditions =
  {
    documentMustNotExist: true,
    authUserCreateForbidden: true,
    AUTH_REQUIRED_FOR_FIXTURE,
    FIXTURE_CREATION_NO_GO,
    writeFlagsMustBeFalse: true,
    operatorOnly: true,
    adminUiForbidden: true,
    financeForbidden: true,
    tripForbidden: true,
    pilotFlagsSeparate: true,
  };

export type Phase5HFixtureCreateGateResult =
  | {
      ok: true;
      wouldCreate: true;
      actualCreate: false;
      message: string;
    }
  | {
      ok: false;
      code: Phase5HFixtureCreateDenialCode;
      wouldCreate: false;
      actualCreate: false;
      message: string;
    };

/**
 * Evaluate create gate. Phase 5H always returns denial for actual create
 * because FIXTURE_CREATION_NO_GO / AUTH_REQUIRED_FOR_FIXTURE.
 */
export function evaluatePhase5HFixtureCreateGate(input: {
  PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE?: string;
  projectId?: string;
  documentId?: string;
  idempotencyKey?: string;
  documentAlreadyExists?: boolean;
  expectedProjectId: string;
  writeFlagsAllFalse: boolean;
}): Phase5HFixtureCreateGateResult {
  if (input.PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE !== "1") {
    return {
      ok: false,
      code: "PHASE5H_FIXTURE_CREATE_SKIP",
      wouldCreate: false,
      actualCreate: false,
      message: "PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE unset/≠1 → SKIP",
    };
  }
  if (!input.writeFlagsAllFalse) {
    return {
      ok: false,
      code: "WRITE_FLAGS_MUST_REMAIN_FALSE",
      wouldCreate: false,
      actualCreate: false,
      message: "Write flags must remain false in Phase 5H preparation",
    };
  }
  if (FIXTURE_CREATION_NO_GO) {
    return {
      ok: false,
      code: "FIXTURE_CREATION_NO_GO",
      wouldCreate: false,
      actualCreate: false,
      message:
        "FIXTURE_CREATION_NO_GO — syncUserClaimsOnWrite Auth dependency; Auth create forbidden",
    };
  }
  if (AUTH_REQUIRED_FOR_FIXTURE) {
    return {
      ok: false,
      code: "AUTH_REQUIRED_FOR_FIXTURE",
      wouldCreate: false,
      actualCreate: false,
      message: "AUTH_REQUIRED_FOR_FIXTURE — STOP; do not create Auth",
    };
  }
  if (
    !input.projectId ||
    input.projectId.trim() !== input.expectedProjectId
  ) {
    return {
      ok: false,
      code: "PROJECT_ID_MISMATCH",
      wouldCreate: false,
      actualCreate: false,
      message: "projectId mismatch",
    };
  }
  if (
    !input.documentId ||
    input.documentId.trim() !== PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID
  ) {
    return {
      ok: false,
      code: "DOCUMENT_ID_MISMATCH",
      wouldCreate: false,
      actualCreate: false,
      message: "documentId must be dedicated Phase 5H strategy id",
    };
  }
  if (
    !input.idempotencyKey ||
    input.idempotencyKey.trim() !== PHASE_5H_FIXTURE_IDEMPOTENCY_KEY
  ) {
    return {
      ok: false,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      wouldCreate: false,
      actualCreate: false,
      message: "idempotency key required / mismatch",
    };
  }
  if (input.documentAlreadyExists === true) {
    return {
      ok: false,
      code: "FIXTURE_ALREADY_EXISTS",
      wouldCreate: false,
      actualCreate: false,
      message: "FIXTURE_ALREADY_EXISTS — no overwrite / merge",
    };
  }

  // Unreachable while FIXTURE_CREATION_NO_GO remains true.
  return {
    ok: true,
    wouldCreate: true,
    actualCreate: false,
    message: "Gate structurally open but Phase 5H must not mutate",
  };
}
