/**
 * Phase 5B — Preconditions / concurrency for Agent Controlled Writes.
 * Load via canonical Agent snapshot. No last-write-wins.
 * Activate: one-country-one-active guard (no auto-deactivate).
 * Country on command must match snapshot — no reassignment.
 */

import type {
  AgentControlledWriteCommand,
  AgentWriteSnapshot,
  ProvenAgentOperationalState,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";
import { resolveAgentTransition } from "@/application/controlled-writes/agents/AgentStateMachine";
import {
  assertNoOtherActiveAgentForCountry,
  type ActiveAgentLookup,
} from "@/application/controlled-writes/agents/AgentCountryUniqueness";

export type AgentWriteLoadPort = ActiveAgentLookup & {
  loadForWrite(agentId: string): Promise<AgentWriteSnapshot | null>;
};

/**
 * Validate existence, operational membership, excludedNonAgent, country match,
 * expected state, token, state machine, and activate uniqueness.
 */
export async function evaluateAgentWritePreconditions(
  command: AgentControlledWriteCommand,
  snapshot: AgentWriteSnapshot | null,
  lookup: ActiveAgentLookup,
): Promise<{
  snapshot: AgentWriteSnapshot;
  toState: ProvenAgentOperationalState;
}> {
  if (!snapshot || !snapshot.exists) {
    throw new AgentWriteError(
      "AGENT_NOT_FOUND",
      `Agent ${command.agentId} not found`,
    );
  }

  if (snapshot.agentId !== command.agentId) {
    throw new AgentWriteError(
      "PRECONDITION_FAILED",
      "Loaded agentId does not match command.agentId",
    );
  }

  if (snapshot.excludedNonAgent) {
    throw new AgentWriteError(
      "NOT_OPERATIONAL_AGENT",
      `Agent ${command.agentId} is excludedNonAgent`,
    );
  }

  if (!snapshot.isOperationalAgent) {
    throw new AgentWriteError(
      "NOT_OPERATIONAL_AGENT",
      `Agent ${command.agentId} is not an operational Agent`,
    );
  }

  // Country represented & matches — no inference / no reassignment
  if (!snapshot.countryId?.trim()) {
    throw new AgentWriteError(
      "PRECONDITION_FAILED",
      "Agent countryId missing on snapshot",
    );
  }

  if (command.countryId !== snapshot.countryId) {
    throw new AgentWriteError(
      "COUNTRY_REASSIGNMENT_NOT_ALLOWED",
      `command.countryId=${command.countryId} snapshot.countryId=${snapshot.countryId}`,
    );
  }

  if (snapshot.operationalState !== command.expectedCurrentState) {
    throw new AgentWriteError(
      "PRECONDITION_FAILED",
      `expectedCurrentState=${command.expectedCurrentState} observed=${snapshot.operationalState}`,
    );
  }

  if (snapshot.preconditionToken !== command.preconditionToken) {
    throw new AgentWriteError(
      "PRECONDITION_FAILED",
      "preconditionToken mismatch (concurrency)",
    );
  }

  const transition = resolveAgentTransition(
    command.action,
    snapshot.operationalState,
  );
  if (!transition.ok) {
    throw new AgentWriteError(transition.code, transition.message);
  }

  if (command.action === "activate") {
    await assertNoOtherActiveAgentForCountry({
      countryId: snapshot.countryId,
      agentId: command.agentId,
      lookup,
    });
  }

  // Deactivate / suspend: no transfer / replacement / settle / move drivers
  // (enforced by command surface — no such fields exist)

  return { snapshot, toState: transition.to };
}
