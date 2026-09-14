/**
 * Phase 5H — SyntheticDriverFixtureRepository (operator-only, create-only).
 * NOT Admin UI. No apply-to-existing. Hard-locked unreachable in preparation.
 * Does NOT create Auth. Does NOT write Production.
 */

import {
  AUTH_REQUIRED_FOR_FIXTURE,
  FIXTURE_CREATION_NO_GO,
  PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
} from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";
import {
  PHASE_5H_FIXTURE_CREATE_ALLOWLIST,
  type Phase5HFixtureCreateAllowlist,
} from "@/application/controlled-writes/pilot/Phase5HFixtureCreateAllowlist";
import {
  PHASE_5H_FIXTURE_CREATE_SEMANTICS,
  PHASE_5H_FIXTURE_IDEMPOTENCY_KEY,
} from "@/application/controlled-writes/pilot/Phase5HFixtureCreateSemantics";

export type SyntheticDriverFixtureRepositoryKind =
  | "synthetic_driver_fixture_unreachable"
  | "disabled_synthetic_driver_fixture";

export type SyntheticDriverFixtureCreatePlan = {
  readonly mode: "create_only";
  readonly collection: "user";
  readonly documentId: typeof PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID;
  readonly allowlist: Phase5HFixtureCreateAllowlist;
  readonly merge: false;
  readonly overwrite: false;
  readonly applyToExisting: false;
  readonly arbitraryPayloadAllowed: false;
  readonly idempotencyKey: typeof PHASE_5H_FIXTURE_IDEMPOTENCY_KEY;
  readonly AUTH_REQUIRED_FOR_FIXTURE: typeof AUTH_REQUIRED_FOR_FIXTURE;
  readonly FIXTURE_CREATION_NO_GO: typeof FIXTURE_CREATION_NO_GO;
  readonly onAlreadyExists: "FIXTURE_ALREADY_EXISTS";
};

export type SyntheticDriverFixtureCreateResult =
  | {
      ok: false;
      code:
        | "FIXTURE_CREATION_NO_GO"
        | "AUTH_REQUIRED_FOR_FIXTURE"
        | "FIXTURE_WRITE_DISABLED"
        | "FIXTURE_ALREADY_EXISTS";
      actualWrite: false;
      message: string;
    };

/**
 * Operator-only create-only repository. apply/create remain hard-locked.
 */
export class SyntheticDriverFixtureRepository {
  readonly kind: SyntheticDriverFixtureRepositoryKind =
    "synthetic_driver_fixture_unreachable";

  static isReachable(flags: {
    GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
    PRODUCTION_WRITE_ENABLED: boolean;
  }): boolean {
    // Never reachable while preparation locks hold — even if flags flipped.
    void flags;
    return false;
  }

  planCreate(): SyntheticDriverFixtureCreatePlan {
    return {
      mode: "create_only",
      collection: "user",
      documentId: PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
      allowlist: PHASE_5H_FIXTURE_CREATE_ALLOWLIST,
      merge: false,
      overwrite: false,
      applyToExisting: PHASE_5H_FIXTURE_CREATE_SEMANTICS.applyToExisting,
      arbitraryPayloadAllowed: false,
      idempotencyKey: PHASE_5H_FIXTURE_IDEMPOTENCY_KEY,
      AUTH_REQUIRED_FOR_FIXTURE,
      FIXTURE_CREATION_NO_GO,
      onAlreadyExists: "FIXTURE_ALREADY_EXISTS",
    };
  }

  /**
   * Hard-locked. Never mutates. Reports FIXTURE_CREATION_NO_GO / Auth stop.
   */
  create(_plan?: SyntheticDriverFixtureCreatePlan): SyntheticDriverFixtureCreateResult {
    void _plan;
    if (FIXTURE_CREATION_NO_GO) {
      return {
        ok: false,
        code: "FIXTURE_CREATION_NO_GO",
        actualWrite: false,
        message:
          "FIXTURE_CREATION_NO_GO — Auth required by syncUserClaimsOnWrite; Auth create forbidden",
      };
    }
    if (AUTH_REQUIRED_FOR_FIXTURE) {
      return {
        ok: false,
        code: "AUTH_REQUIRED_FOR_FIXTURE",
        actualWrite: false,
        message: "AUTH_REQUIRED_FOR_FIXTURE — STOP; do not create Auth",
      };
    }
    return {
      ok: false,
      code: "FIXTURE_WRITE_DISABLED",
      actualWrite: false,
      message: "SyntheticDriverFixtureRepository create hard-locked",
    };
  }

  /** Explicitly forbidden — create-only repository. */
  applyToExisting(): SyntheticDriverFixtureCreateResult {
    return {
      ok: false,
      code: "FIXTURE_WRITE_DISABLED",
      actualWrite: false,
      message: "applyToExisting forbidden — create-only repository",
    };
  }
}

export function createSyntheticDriverFixtureRepository(): SyntheticDriverFixtureRepository {
  return new SyntheticDriverFixtureRepository();
}

export const SYNTHETIC_DRIVER_FIXTURE_REPO_REVIEW = {
  kind: "synthetic_driver_fixture_unreachable" as const,
  activated: false,
  hardLock: true,
  createOnly: true,
  applyToExisting: false,
  adminUi: false,
  operatorOnly: true,
  arbitraryRecordPayload: false,
  notes:
    "Dedicated SyntheticDriverFixtureRepository prepared for future operator " +
    "create. Hard-locked. FIXTURE_CREATION_NO_GO while Auth required. Do not activate.",
} as const;
