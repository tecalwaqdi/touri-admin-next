/**
 * Phase 5B — Agent Controlled Write command constructors.
 */

import type {
  ActivateAgentCommand,
  AgentDeactivateReasonCode,
  AgentSuspendReasonCode,
  DeactivateAgentCommand,
  ProvenAgentOperationalState,
  SuspendAgentCommand,
  VerifiedAgentWriteActor,
} from "@/application/controlled-writes/agents/AgentWriteTypes";

type BaseInput = {
  actor: VerifiedAgentWriteActor;
  agentId: string;
  countryId: string;
  expectedCurrentState: ProvenAgentOperationalState;
  preconditionToken: string;
  idempotencyKey: string;
  correlationId: string;
};

export function createActivateAgentCommand(
  input: BaseInput,
): ActivateAgentCommand {
  return { ...input, action: "activate" };
}

export function createDeactivateAgentCommand(
  input: BaseInput & {
    reasonCode?: AgentDeactivateReasonCode;
    note?: string;
  },
): DeactivateAgentCommand {
  return {
    ...input,
    action: "deactivate",
    reasonCode: input.reasonCode,
    note: input.note,
  };
}

export function createSuspendAgentCommand(
  input: BaseInput & {
    reasonCode: AgentSuspendReasonCode;
    note?: string;
  },
): SuspendAgentCommand {
  return {
    ...input,
    action: "suspend",
    reasonCode: input.reasonCode,
    note: input.note,
  };
}

/** Aliases matching command type names for call-site readability. */
export {
  createActivateAgentCommand as activateAgent,
  createDeactivateAgentCommand as deactivateAgent,
  createSuspendAgentCommand as suspendAgent,
};
