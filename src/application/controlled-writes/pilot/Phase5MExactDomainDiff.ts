/**
 * Phase 5M — exact domain diff contract + PILOT_DIFF_VIOLATION fail-closed.
 */

import {
  assertFirestorePatchAllowlisted,
  buildNeedsChangesAllowlistedPatch,
  type Phase5ENeedsChangesAllowlistedPatch,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotDiffContract";

export const PHASE_5M_EXACT_DOMAIN_DIFF: Phase5ENeedsChangesAllowlistedPatch =
  buildNeedsChangesAllowlistedPatch();

export const PHASE_5M_FORBIDDEN_FIELD_SAMPLES = [
  "actev_mndob",
  "wallet",
  "earnings",
  "on_trip",
  "ismndob",
  "Rev_dolh",
  "mndob_vill",
  "phone",
  "email",
] as const;

export type Phase5MDiffEvaluation =
  | {
      ok: true;
      diff: Phase5ENeedsChangesAllowlistedPatch;
      code: "PILOT_DIFF_OK";
    }
  | {
      ok: false;
      code: "PILOT_DIFF_VIOLATION";
      unexpectedFields: readonly string[];
      message: string;
    };

/** Fail-closed: only { registration_status: "needs_changes" } is allowed. */
export function evaluatePhase5MExactDomainDiff(input?: {
  patch?: Readonly<Record<string, unknown>>;
}): Phase5MDiffEvaluation {
  const patch = input?.patch ?? PHASE_5M_EXACT_DOMAIN_DIFF;
  const allow = assertFirestorePatchAllowlisted(patch);
  if (!allow.ok) {
    return {
      ok: false,
      code: "PILOT_DIFF_VIOLATION",
      unexpectedFields: allow.unexpectedFields,
      message: `PILOT_DIFF_VIOLATION: ${allow.unexpectedFields.join(",")}`,
    };
  }
  if (
    (patch as { registration_status?: unknown }).registration_status !==
    "needs_changes"
  ) {
    return {
      ok: false,
      code: "PILOT_DIFF_VIOLATION",
      unexpectedFields: ["registration_status"],
      message: "PILOT_DIFF_VIOLATION: registration_status must be needs_changes",
    };
  }
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== "registration_status") {
    return {
      ok: false,
      code: "PILOT_DIFF_VIOLATION",
      unexpectedFields: keys.filter((k) => k !== "registration_status"),
      message: "PILOT_DIFF_VIOLATION: exact key set must be registration_status only",
    };
  }
  return {
    ok: true,
    diff: PHASE_5M_EXACT_DOMAIN_DIFF,
    code: "PILOT_DIFF_OK",
  };
}
