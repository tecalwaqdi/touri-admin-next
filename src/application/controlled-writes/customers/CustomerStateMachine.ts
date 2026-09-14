/**
 * Phase 5C — Proven Customer operational state machine.
 * Only listed transitions are allowed. Invalid → INVALID_CUSTOMER_STATE_TRANSITION.
 *
 * Minimum proven transitions:
 *   enabled → disabled (disable)
 *   enabled → blocked (block)
 *   disabled → enabled (reactivate)
 *   blocked → enabled (reactivate)
 *
 * Explicitly denied (unless later proven):
 *   deleted → enabled / blocked (no recreate/restore)
 *   unknown → enabled / blocked
 *   disabled ↔ blocked (keep disable vs block semantically distinct)
 */

import type {
  CustomerControlledWriteAction,
  ProvenCustomerOperationalState,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

export type CustomerStateTransition = {
  from: ProvenCustomerOperationalState;
  to: ProvenCustomerOperationalState;
  action: CustomerControlledWriteAction;
};

export const PROVEN_CUSTOMER_STATE_TRANSITIONS: readonly CustomerStateTransition[] =
  [
    { from: "enabled", to: "disabled", action: "disable" },
    { from: "enabled", to: "blocked", action: "block" },
    { from: "disabled", to: "enabled", action: "reactivate" },
    { from: "blocked", to: "enabled", action: "reactivate" },
  ] as const;

const TARGET_BY_ACTION: Record<
  CustomerControlledWriteAction,
  ProvenCustomerOperationalState
> = {
  disable: "disabled",
  block: "blocked",
  reactivate: "enabled",
};

export function targetStateForCustomerAction(
  action: CustomerControlledWriteAction,
): ProvenCustomerOperationalState {
  return TARGET_BY_ACTION[action];
}

export function isProvenCustomerTransition(
  from: ProvenCustomerOperationalState,
  to: ProvenCustomerOperationalState,
  action?: CustomerControlledWriteAction,
): boolean {
  return PROVEN_CUSTOMER_STATE_TRANSITIONS.some(
    (t) =>
      t.from === from &&
      t.to === to &&
      (action == null || t.action === action),
  );
}

export function resolveCustomerTransition(
  action: CustomerControlledWriteAction,
  from: ProvenCustomerOperationalState,
):
  | { ok: true; to: ProvenCustomerOperationalState }
  | {
      ok: false;
      code: "INVALID_CUSTOMER_STATE_TRANSITION";
      message: string;
    } {
  const to = targetStateForCustomerAction(action);
  if (!isProvenCustomerTransition(from, to, action)) {
    return {
      ok: false,
      code: "INVALID_CUSTOMER_STATE_TRANSITION",
      message: `Invalid transition ${from}→${to} via ${action}`,
    };
  }
  return { ok: true, to };
}

export function assertCustomerTransition(
  action: CustomerControlledWriteAction,
  from: ProvenCustomerOperationalState,
): ProvenCustomerOperationalState {
  const resolved = resolveCustomerTransition(action, from);
  if (!resolved.ok) {
    throw new CustomerWriteError(resolved.code, resolved.message);
  }
  return resolved.to;
}

/** All proven from-states for a given admin action. */
export function allowedFromStatesForCustomerAction(
  action: CustomerControlledWriteAction,
): ProvenCustomerOperationalState[] {
  return PROVEN_CUSTOMER_STATE_TRANSITIONS.filter((t) => t.action === action).map(
    (t) => t.from,
  );
}
