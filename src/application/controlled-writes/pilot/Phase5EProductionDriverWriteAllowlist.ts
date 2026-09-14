/**
 * Phase 5E — Structural Production Driver write allowlist + transaction contract.
 * Used by ProductionDriverWriteRepository preparation. Does NOT execute writes.
 * No Record<string, unknown> arbitrary payloads.
 */

import type {
  DriverControlledWriteAction,
  ProvenDriverRegistrationState,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import {
  buildNeedsChangesAllowlistedPatch,
  type Phase5ENeedsChangesAllowlistedPatch,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotDiffContract";

export type ProductionDriverWriteTransactionPrecondition = {
  collection: "user";
  documentId: string;
  /** Opaque concurrency token — must match loaded snapshot. */
  preconditionToken: string;
  expectedRegistrationStatus: ProvenDriverRegistrationState;
};

/**
 * Allowlisted patches per action. Only needs_changes is in Pilot scope.
 * Other actions remain structurally typed but out of Phase 5E Pilot.
 */
export type ProductionDriverAllowlistedPatch =
  | Phase5ENeedsChangesAllowlistedPatch
  | { readonly registration_status: "approved" }
  | { readonly registration_status: "rejected" }
  | { readonly registration_status: "suspended" };

export function buildAllowlistedPatchForAction(
  action: DriverControlledWriteAction,
  toState: ProvenDriverRegistrationState,
): ProductionDriverAllowlistedPatch {
  switch (action) {
    case "needs_changes":
      if (toState !== "needs_changes") {
        throw new Error("needs_changes action requires toState=needs_changes");
      }
      return buildNeedsChangesAllowlistedPatch();
    case "approve":
      return { registration_status: "approved" };
    case "reject":
      return { registration_status: "rejected" };
    case "suspend":
      return { registration_status: "suspended" };
  }
}

/**
 * Structural transaction plan for Production path (not executed while hard-locked).
 */
export type ProductionDriverWriteTransactionPlan = {
  mode: "transaction_with_precondition";
  precondition: ProductionDriverWriteTransactionPrecondition;
  patch: ProductionDriverAllowlistedPatch;
  /** Reject any extra keys — enforced by typed patch. */
  arbitraryPayloadAllowed: false;
  /** Fail closed if unexpected field would be written. */
  onUnexpectedField: "PILOT_UNEXPECTED_FIELD_MUTATION";
};

export function planProductionDriverWriteTransaction(input: {
  action: DriverControlledWriteAction;
  driverId: string;
  preconditionToken: string;
  fromState: ProvenDriverRegistrationState;
  toState: ProvenDriverRegistrationState;
}): ProductionDriverWriteTransactionPlan {
  return {
    mode: "transaction_with_precondition",
    precondition: {
      collection: "user",
      documentId: input.driverId,
      preconditionToken: input.preconditionToken,
      expectedRegistrationStatus: input.fromState,
    },
    patch: buildAllowlistedPatchForAction(input.action, input.toState),
    arbitraryPayloadAllowed: false,
    onUnexpectedField: "PILOT_UNEXPECTED_FIELD_MUTATION",
  };
}

/** Why ProductionDriverWriteRepository remains unreachable in Phase 5E. */
export const PRODUCTION_DRIVER_WRITE_REPO_REVIEW = {
  kind: "production_driver_write_unreachable",
  activated: false,
  hardLock: true,
  transactionPrecondition: true,
  allowlistedFieldsOnly: true,
  arbitraryRecordPayload: false,
  pilotActionInScope: "needs_changes" as const,
  notes:
    "Structurally prepared with typed allowlisted patches + transaction " +
    "precondition plan. apply() remains hard-locked unreachable. Do not activate.",
} as const;
