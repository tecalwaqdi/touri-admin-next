/**
 * Phase 5J — fixture provisioning state machine.
 * planned → auth_created → firestore_created → claims_verified →
 * fixture_verified → pilot_ready | failed_partial*
 * Auth-only / claim-sync partials: no second Auth create; preserve UID; no auto-delete.
 */

export type Phase5JFixtureStatus =
  | "planned"
  | "auth_created"
  | "firestore_created"
  | "claims_verified"
  | "fixture_verified"
  | "pilot_ready"
  | "failed_partial_auth_only"
  | "failed_partial_firestore"
  | "failed_partial_claims"
  | "failed_partial_canonical"
  | "failed_partial";

export type Phase5JPartialFailureKind =
  | "auth_create_failed"
  | "auth_only_orphan"
  | "firestore_create_failed"
  | "claim_sync_timeout"
  | "unexpected_fixture_claims"
  | "canonical_verification_failed"
  | "none";

export const PHASE_5J_FIXTURE_STATE_MACHINE: readonly {
  from: Phase5JFixtureStatus;
  to: Phase5JFixtureStatus;
  via: string;
}[] = [
  { from: "planned", to: "auth_created", via: "auth.createUser({disabled:true})" },
  {
    from: "auth_created",
    to: "firestore_created",
    via: "user/{uid} create-only",
  },
  {
    from: "firestore_created",
    to: "claims_verified",
    via: "bounded claim poll matches {country_id}",
  },
  {
    from: "claims_verified",
    to: "fixture_verified",
    via: "canonical Driver + side-effect checks",
  },
  {
    from: "fixture_verified",
    to: "pilot_ready",
    via: "all verification gates pass",
  },
  {
    from: "planned",
    to: "failed_partial",
    via: "auth create failure before UID",
  },
  {
    from: "auth_created",
    to: "failed_partial_auth_only",
    via: "Firestore create failure — Auth orphan; no second Auth create",
  },
  {
    from: "firestore_created",
    to: "failed_partial_claims",
    via: "CLAIM_SYNC_TIMEOUT or UNEXPECTED_FIXTURE_CLAIMS",
  },
  {
    from: "claims_verified",
    to: "failed_partial_canonical",
    via: "canonical / side-effect verification failed",
  },
] as const;

export const PHASE_5J_PARTIAL_FAILURE_POLICY = {
  multiAuthCreateForbidden: true,
  autoDeleteForbidden: true,
  registryPreservesUid: true,
  resumeRequiresSeparateApproval: true,
} as const;

export function isPhase5JTerminalProvisioned(
  status: Phase5JFixtureStatus,
): boolean {
  return (
    status === "firestore_created" ||
    status === "claims_verified" ||
    status === "fixture_verified" ||
    status === "pilot_ready"
  );
}

export function isPhase5JPartialFailure(
  status: Phase5JFixtureStatus,
): boolean {
  return (
    status === "failed_partial" ||
    status === "failed_partial_auth_only" ||
    status === "failed_partial_firestore" ||
    status === "failed_partial_claims" ||
    status === "failed_partial_canonical"
  );
}

export function isPhase5JPilotReady(status: Phase5JFixtureStatus): boolean {
  return status === "pilot_ready";
}
