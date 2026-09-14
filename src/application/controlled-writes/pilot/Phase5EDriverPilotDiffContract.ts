/**
 * Phase 5E — Exact before/after + allowed-diff allowlist for Driver needs_changes Pilot.
 * PREPARATION ONLY — does not mutate Production.
 */

import type { ProvenDriverRegistrationState } from "@/application/controlled-writes/drivers/DriverWriteTypes";

/** Exact before state required for Pilot. */
export const PHASE_5E_EXACT_BEFORE_STATE = {
  registrationStatus: "pending_review" as const satisfies ProvenDriverRegistrationState,
  accountEnabled: "disabled" as const,
  tripState: "idle" as const,
  /** Must be captured from live precondition read — opaque token. */
  preconditionToken: "<captured_at_precondition_read>",
  isOperationalDriver: true as const,
  action: "needs_changes" as const,
} as const;

/** Exact after state expected after successful Pilot. */
export const PHASE_5E_EXACT_AFTER_STATE = {
  registrationStatus: "needs_changes" as const satisfies ProvenDriverRegistrationState,
  accountEnabled: "disabled" as const,
  tripState: "idle" as const,
  /** Token must rotate; exact value unknown until apply. */
  preconditionToken: "<rotated_after_apply>",
  isOperationalDriver: true as const,
} as const;

/**
 * Firestore field allowlist for needs_changes Pilot patch.
 * Narrower than full Legacy Admin requestChangesPatch intentionally —
 * Controlled Writes Fake only mutates registration status for this action.
 * Proven SoT field: registration_status (4A-5 / CanonicalDriverRegistrationStatus).
 */
export const PHASE_5E_NEEDS_CHANGES_FIRESTORE_ALLOWLIST = [
  "registration_status",
] as const;

export type Phase5ENeedsChangesFirestoreField =
  (typeof PHASE_5E_NEEDS_CHANGES_FIRESTORE_ALLOWLIST)[number];

/** Domain snapshot fields that MAY change. */
export const PHASE_5E_ALLOWED_DOMAIN_DIFF = [
  "registrationStatus",
  "preconditionToken",
] as const;

/** Domain snapshot fields that MUST NOT change. */
export const PHASE_5E_FORBIDDEN_DOMAIN_DIFF = [
  "driverId",
  "exists",
  "isOperationalDriver",
  "accountEnabled",
  "complianceStatus",
  "tripState",
  "countryId",
  "countryScopeKind",
] as const;

export type PilotDiffFieldResult =
  | { ok: true; field: string; before: unknown; after: unknown }
  | {
      ok: false;
      code: "PILOT_UNEXPECTED_FIELD_MUTATION";
      field: string;
      before: unknown;
      after: unknown;
      message: string;
    };

/**
 * Compare before/after domain snapshots against allowlist.
 * Any non-allowlisted field change → PILOT_UNEXPECTED_FIELD_MUTATION.
 */
export function evaluatePilotDomainDiff(input: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): {
  ok: boolean;
  allowedChanges: PilotDiffFieldResult[];
  unexpected: PilotDiffFieldResult[];
} {
  const keys = new Set([
    ...Object.keys(input.before),
    ...Object.keys(input.after),
  ]);
  const allowed = new Set<string>(PHASE_5E_ALLOWED_DOMAIN_DIFF);
  const allowedChanges: PilotDiffFieldResult[] = [];
  const unexpected: PilotDiffFieldResult[] = [];

  for (const field of keys) {
    const before = input.before[field];
    const after = input.after[field];
    if (Object.is(before, after)) continue;
    if (allowed.has(field)) {
      allowedChanges.push({ ok: true, field, before, after });
    } else {
      unexpected.push({
        ok: false,
        code: "PILOT_UNEXPECTED_FIELD_MUTATION",
        field,
        before,
        after,
        message: `Unexpected field mutation: ${field}`,
      });
    }
  }

  return {
    ok: unexpected.length === 0,
    allowedChanges,
    unexpected,
  };
}

/**
 * Reject any Firestore patch key outside the allowlist.
 */
export function assertFirestorePatchAllowlisted(
  patch: Readonly<Record<string, unknown>>,
):
  | { ok: true }
  | {
      ok: false;
      code: "PILOT_UNEXPECTED_FIELD_MUTATION";
      unexpectedFields: string[];
    } {
  const allowed = new Set<string>(PHASE_5E_NEEDS_CHANGES_FIRESTORE_ALLOWLIST);
  const unexpectedFields = Object.keys(patch).filter((k) => !allowed.has(k));
  if (unexpectedFields.length > 0) {
    return {
      ok: false,
      code: "PILOT_UNEXPECTED_FIELD_MUTATION",
      unexpectedFields,
    };
  }
  return { ok: true };
}

/**
 * Typed needs_changes patch — no Record&lt;string, unknown&gt; arbitrary payload.
 */
export type Phase5ENeedsChangesAllowlistedPatch = {
  readonly registration_status: "needs_changes";
};

export function buildNeedsChangesAllowlistedPatch(): Phase5ENeedsChangesAllowlistedPatch {
  return { registration_status: "needs_changes" };
}
