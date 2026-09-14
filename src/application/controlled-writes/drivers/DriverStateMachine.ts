/**
 * Phase 5A — Proven Driver registration state machine.
 * Only listed transitions are allowed. Invalid → INVALID_DRIVER_STATE_TRANSITION.
 *
 * Minimum proven transitions:
 *   pending_review → approved | rejected | needs_changes
 *   needs_changes → pending_review
 *   approved → suspended
 *   suspended → approved
 */

import type {
  DriverControlledWriteAction,
  ProvenDriverRegistrationState,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import {
  DriverWriteError,
} from "@/application/controlled-writes/drivers/DriverWriteErrors";

export type DriverStateTransition = {
  from: ProvenDriverRegistrationState;
  to: ProvenDriverRegistrationState;
  action: DriverControlledWriteAction | "resubmit_to_review";
};

/**
 * Proven transitions only. `resubmit_to_review` is the needs_changes→pending_review
 * edge (driver resubmission / internal). Admin Phase 5A commands do not expose it;
 * it remains in the matrix for validation completeness.
 */
export const PROVEN_DRIVER_STATE_TRANSITIONS: readonly DriverStateTransition[] = [
  { from: "pending_review", to: "approved", action: "approve" },
  { from: "pending_review", to: "rejected", action: "reject" },
  { from: "pending_review", to: "needs_changes", action: "needs_changes" },
  { from: "needs_changes", to: "pending_review", action: "resubmit_to_review" },
  { from: "approved", to: "suspended", action: "suspend" },
  { from: "suspended", to: "approved", action: "approve" },
] as const;

const TARGET_BY_ACTION: Record<
  DriverControlledWriteAction,
  ProvenDriverRegistrationState
> = {
  approve: "approved",
  reject: "rejected",
  needs_changes: "needs_changes",
  suspend: "suspended",
};

export function targetStateForAction(
  action: DriverControlledWriteAction,
): ProvenDriverRegistrationState {
  return TARGET_BY_ACTION[action];
}

export function isProvenDriverTransition(
  from: ProvenDriverRegistrationState,
  to: ProvenDriverRegistrationState,
  action?: DriverControlledWriteAction | "resubmit_to_review",
): boolean {
  return PROVEN_DRIVER_STATE_TRANSITIONS.some(
    (t) =>
      t.from === from &&
      t.to === to &&
      (action == null || t.action === action),
  );
}

export function resolveDriverTransition(
  action: DriverControlledWriteAction,
  from: ProvenDriverRegistrationState,
):
  | { ok: true; to: ProvenDriverRegistrationState }
  | { ok: false; code: "INVALID_DRIVER_STATE_TRANSITION"; message: string } {
  const to = targetStateForAction(action);
  if (!isProvenDriverTransition(from, to, action)) {
    return {
      ok: false,
      code: "INVALID_DRIVER_STATE_TRANSITION",
      message: `Invalid transition ${from}→${to} via ${action}`,
    };
  }
  return { ok: true, to };
}

export function assertDriverTransition(
  action: DriverControlledWriteAction,
  from: ProvenDriverRegistrationState,
): ProvenDriverRegistrationState {
  const resolved = resolveDriverTransition(action, from);
  if (!resolved.ok) {
    throw new DriverWriteError(resolved.code, resolved.message);
  }
  return resolved.to;
}

/** All proven from-states for a given admin action. */
export function allowedFromStatesForAction(
  action: DriverControlledWriteAction,
): ProvenDriverRegistrationState[] {
  return PROVEN_DRIVER_STATE_TRANSITIONS.filter((t) => t.action === action).map(
    (t) => t.from,
  );
}
