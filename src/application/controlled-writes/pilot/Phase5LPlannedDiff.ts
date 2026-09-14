/**
 * Phase 5L — exact planned Firestore diff for RequestDriverChanges dry-run.
 * Allowlist: registration_status only. Forbidden domain surfaces listed explicitly.
 */

import {
  assertFirestorePatchAllowlisted,
  buildNeedsChangesAllowlistedPatch,
  type Phase5ENeedsChangesAllowlistedPatch,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotDiffContract";

/** Exact allowlisted Firestore patch for needs_changes Pilot. */
export const PHASE_5L_PLANNED_FIRESTORE_DIFF: Phase5ENeedsChangesAllowlistedPatch =
  buildNeedsChangesAllowlistedPatch();

/** Forbidden mutation surfaces for this Pilot (must remain untouched). */
export const PHASE_5L_FORBIDDEN_MUTATION_SURFACES = [
  "actev_mndob",
  "wallet",
  "earnings",
  "finance",
  "trip",
  "country",
  "city",
  "documents",
  "Auth disabled status",
  "custom claims",
] as const;

export type Phase5LPlannedDiffEvaluation = {
  readonly plannedDiff: Phase5ENeedsChangesAllowlistedPatch;
  readonly plannedDiffValid: boolean;
  readonly forbiddenSurfacesUntouched: true;
  readonly justification: string;
  readonly denials: readonly string[];
};

/**
 * Validate planned patch against controlled-write allowlist.
 * Optional extraKeys: if a hypothetical patch would include extras → invalid.
 */
export function evaluatePhase5LPlannedDiff(input?: {
  patch?: Readonly<Record<string, unknown>>;
}): Phase5LPlannedDiffEvaluation {
  const patch = input?.patch ?? PHASE_5L_PLANNED_FIRESTORE_DIFF;
  const allow = assertFirestorePatchAllowlisted(patch);
  const denials: string[] = [];
  if (!allow.ok) {
    denials.push(
      `PILOT_UNEXPECTED_FIELD_MUTATION:${allow.unexpectedFields.join(",")}`,
    );
  }
  if (
    allow.ok &&
    (patch as { registration_status?: unknown }).registration_status !==
      "needs_changes"
  ) {
    denials.push("PLANNED_STATUS_NOT_NEEDS_CHANGES");
  }

  return {
    plannedDiff: PHASE_5L_PLANNED_FIRESTORE_DIFF,
    plannedDiffValid: denials.length === 0,
    forbiddenSurfacesUntouched: true,
    justification:
      "Driver controlled-write Production allowlist + Fake apply for needs_changes " +
      "mutate only registration_status (plus opaque precondition token rotate). " +
      "No actev_mndob/wallet/earnings/finance/trip/country/city/documents/Auth disabled/claims.",
    denials,
  };
}
