/**
 * Phase 5I — provisioning order, partial failure, state machine, idempotency, registry.
 * Order proved from Legacy createPanelUser (Auth create → Firestore user/{uid}).
 * DESIGN ONLY — no live provision.
 */

import { PHASE_5I_LOGICAL_FIXTURE_NAME } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";

/**
 * Proven order from ara-ban createPanelUser:
 * 1) admin.auth().createUser(...)
 * 2) db.doc(`user/${uid}`).set(...)  → syncUserClaimsOnWrite fires
 *
 * Phase 5I mirrors this order (without createPanelUser email/password).
 */
export const PHASE_5I_PROVISIONING_ORDER = [
  "auth_createUser_disabled",
  "firestore_user_doc_create_same_uid",
  "syncUserClaimsOnWrite_setCustomUserClaims",
  "operator_verify_claims_membership_registry",
] as const;

export type Phase5IFixtureState =
  | "planned"
  | "auth_created"
  | "firestore_created"
  | "claims_synced"
  | "verified"
  | "pilot_ready"
  | "failed_partial"
  | "retired";

export const PHASE_5I_FIXTURE_STATE_MACHINE: readonly {
  from: Phase5IFixtureState;
  to: Phase5IFixtureState;
  via: string;
}[] = [
  { from: "planned", to: "auth_created", via: "auth.createUser success" },
  {
    from: "auth_created",
    to: "firestore_created",
    via: "user/{uid} create success",
  },
  {
    from: "firestore_created",
    to: "claims_synced",
    via: "syncUserClaimsOnWrite success",
  },
  {
    from: "claims_synced",
    to: "verified",
    via: "operator verify membership+claims",
  },
  { from: "verified", to: "pilot_ready", via: "5F/5G safePilotEligible" },
  {
    from: "planned",
    to: "failed_partial",
    via: "auth create failure",
  },
  {
    from: "auth_created",
    to: "failed_partial",
    via: "firestore create failure (Auth-only orphan)",
  },
  {
    from: "firestore_created",
    to: "failed_partial",
    via: "claims sync failure",
  },
  {
    from: "pilot_ready",
    to: "retired",
    via: "operator retire (retain markers; no destructive delete required)",
  },
] as const;

export type Phase5IPartialFailureMode =
  | "auth_only_orphan"
  | "auth_and_firestore_claims_pending"
  | "none";

export const PHASE_5I_PARTIAL_FAILURE_HANDLING = {
  authOnlyOrphan: {
    mode: "auth_only_orphan" as const,
    description:
      "Auth user created; Firestore user/{uid} missing. syncUserClaims never ran. " +
      "Do NOT create second Auth user. Operator verify/cleanup under separate approval.",
    multiCreateForbidden: true,
  },
  claimsSyncFailure: {
    mode: "auth_and_firestore_claims_pending" as const,
    description:
      "Auth+Firestore exist; setCustomUserClaims failed. State=failed_partial. " +
      "Idempotent retry may re-touch Firestore carefully under separate approval — " +
      "Phase 5I design does not auto-retry.",
    multiCreateForbidden: true,
  },
} as const;

export const PHASE_5I_CREATE_SEMANTICS = {
  mode: "create_only" as const,
  merge: false,
  overwrite: false,
  applyToExisting: false,
  multiCreateForbidden: true,
  onAlreadyExists: "FIXTURE_ALREADY_EXISTS" as const,
  idempotencyKey: "phase5i_provision_synthetic_driver_v1" as const,
} as const;

/**
 * Operator registry record — NO password / token / PII.
 * Logical name is stable; UID filled after Auth create.
 */
export type Phase5IOperatorRegistryRecord = {
  readonly logicalName: typeof PHASE_5I_LOGICAL_FIXTURE_NAME;
  readonly uid: string | null;
  readonly status: Phase5IFixtureState;
  readonly authDisabled: true;
  readonly passwordStored: false;
  readonly tokenStored: false;
  readonly piiStored: false;
};

export function buildEmptyOperatorRegistryRecord(): Phase5IOperatorRegistryRecord {
  return {
    logicalName: PHASE_5I_LOGICAL_FIXTURE_NAME,
    uid: null,
    status: "planned",
    authDisabled: true,
    passwordStored: false,
    tokenStored: false,
    piiStored: false,
  };
}

/**
 * Idempotency without multi-create:
 * - If registry has uid + status in {firestore_created..pilot_ready} → refuse new Auth create
 * - If registry auth_created only → resume Firestore create for that uid (future; not Phase 5I live)
 * - Logical name is the idempotency identity (not a new random Auth each run)
 */
export function evaluateIdempotencyGate(registry: Phase5IOperatorRegistryRecord): {
  allowAuthCreate: boolean;
  code:
    | "IDEMPOTENT_PLANNED_OK"
    | "RESUME_FIRESTORE_ONLY"
    | "FIXTURE_ALREADY_EXISTS"
    | "FAILED_PARTIAL_NO_MULTI_CREATE";
  message: string;
} {
  if (registry.logicalName !== PHASE_5I_LOGICAL_FIXTURE_NAME) {
    return {
      allowAuthCreate: false,
      code: "FAILED_PARTIAL_NO_MULTI_CREATE",
      message: "logicalName mismatch",
    };
  }
  if (registry.status === "planned" && registry.uid == null) {
    return {
      allowAuthCreate: true,
      code: "IDEMPOTENT_PLANNED_OK",
      message: "No prior Auth — single create permitted when write gates open",
    };
  }
  if (registry.status === "auth_created" && registry.uid != null) {
    return {
      allowAuthCreate: false,
      code: "RESUME_FIRESTORE_ONLY",
      message: "Auth exists — do not multi-create Auth; resume Firestore only",
    };
  }
  if (
    registry.status === "failed_partial" ||
    registry.uid != null
  ) {
    const terminal =
      registry.status === "firestore_created" ||
      registry.status === "claims_synced" ||
      registry.status === "verified" ||
      registry.status === "pilot_ready" ||
      registry.status === "retired";
    if (terminal) {
      return {
        allowAuthCreate: false,
        code: "FIXTURE_ALREADY_EXISTS",
        message: "Fixture already provisioned — create-only refuse",
      };
    }
    return {
      allowAuthCreate: false,
      code: "FAILED_PARTIAL_NO_MULTI_CREATE",
      message: "Partial failure — no second Auth create",
    };
  }
  return {
    allowAuthCreate: false,
    code: "FIXTURE_ALREADY_EXISTS",
    message: "Refuse multi-create",
  };
}
