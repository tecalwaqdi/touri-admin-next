/**
 * Phase 5B — Proven Agent operational state machine.
 * Only listed transitions are allowed. Invalid → INVALID_AGENT_STATE_TRANSITION.
 *
 * Minimum proven transitions:
 *   inactive → active (activate)
 *   pending → active (activate)
 *   active → inactive (deactivate)
 *   active → suspended (suspend)
 *   suspended → active (activate)
 */

import type {
  AgentControlledWriteAction,
  ProvenAgentOperationalState,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";

export type AgentStateTransition = {
  from: ProvenAgentOperationalState;
  to: ProvenAgentOperationalState;
  action: AgentControlledWriteAction;
};

export const PROVEN_AGENT_STATE_TRANSITIONS: readonly AgentStateTransition[] = [
  { from: "inactive", to: "active", action: "activate" },
  { from: "pending", to: "active", action: "activate" },
  { from: "suspended", to: "active", action: "activate" },
  { from: "active", to: "inactive", action: "deactivate" },
  { from: "active", to: "suspended", action: "suspend" },
] as const;

const TARGET_BY_ACTION: Record<
  AgentControlledWriteAction,
  ProvenAgentOperationalState
> = {
  activate: "active",
  deactivate: "inactive",
  suspend: "suspended",
};

export function targetStateForAgentAction(
  action: AgentControlledWriteAction,
): ProvenAgentOperationalState {
  return TARGET_BY_ACTION[action];
}

export function isProvenAgentTransition(
  from: ProvenAgentOperationalState,
  to: ProvenAgentOperationalState,
  action?: AgentControlledWriteAction,
): boolean {
  return PROVEN_AGENT_STATE_TRANSITIONS.some(
    (t) =>
      t.from === from &&
      t.to === to &&
      (action == null || t.action === action),
  );
}

export function resolveAgentTransition(
  action: AgentControlledWriteAction,
  from: ProvenAgentOperationalState,
):
  | { ok: true; to: ProvenAgentOperationalState }
  | { ok: false; code: "INVALID_AGENT_STATE_TRANSITION"; message: string } {
  const to = targetStateForAgentAction(action);
  if (!isProvenAgentTransition(from, to, action)) {
    return {
      ok: false,
      code: "INVALID_AGENT_STATE_TRANSITION",
      message: `Invalid transition ${from}→${to} via ${action}`,
    };
  }
  return { ok: true, to };
}

export function assertAgentTransition(
  action: AgentControlledWriteAction,
  from: ProvenAgentOperationalState,
): ProvenAgentOperationalState {
  const resolved = resolveAgentTransition(action, from);
  if (!resolved.ok) {
    throw new AgentWriteError(resolved.code, resolved.message);
  }
  return resolved.to;
}

/** All proven from-states for a given admin action. */
export function allowedFromStatesForAgentAction(
  action: AgentControlledWriteAction,
): ProvenAgentOperationalState[] {
  return PROVEN_AGENT_STATE_TRANSITIONS.filter((t) => t.action === action).map(
    (t) => t.from,
  );
}
