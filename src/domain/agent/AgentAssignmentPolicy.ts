import type { Agent } from "@/types/agent";

export type AgentAssignmentDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "COUNTRY_ALREADY_HAS_ACTIVE_AGENT" | "AGENT_INACTIVE" | "INVALID_COUNTRY";
      message: string;
      existingActiveAgentId?: string;
    };

/**
 * Domain service: Country 1 <-> 0..1 Active Agent.
 * Enforced in backend/domain layer, not UI-only.
 */
export class AgentAssignmentPolicy {
  canActivateAgent(input: {
    countryId: string;
    agentId: string;
    agentStatus: Agent["status"];
    existingAgents: Agent[];
  }): AgentAssignmentDecision {
    if (!input.countryId.trim()) {
      return {
        allowed: false,
        code: "INVALID_COUNTRY",
        message: "countryId is required",
      };
    }

    if (input.agentStatus === "suspended") {
      return {
        allowed: false,
        code: "AGENT_INACTIVE",
        message: "Suspended agents cannot be activated",
      };
    }

    const otherActive = input.existingAgents.find(
      (agent) =>
        agent.countryId === input.countryId &&
        agent.status === "active" &&
        agent.id !== input.agentId,
    );

    if (otherActive) {
      return {
        allowed: false,
        code: "COUNTRY_ALREADY_HAS_ACTIVE_AGENT",
        message: `Country ${input.countryId} already has active agent ${otherActive.id}`,
        existingActiveAgentId: otherActive.id,
      };
    }

    return { allowed: true };
  }

  validateSeed(agents: Agent[]): {
    valid: boolean;
    violations: Array<{ countryId: string; agentIds: string[] }>;
  } {
    const byCountry = new Map<string, string[]>();
    for (const agent of agents) {
      if (agent.status !== "active") continue;
      const list = byCountry.get(agent.countryId) ?? [];
      list.push(agent.id);
      byCountry.set(agent.countryId, list);
    }

    const violations = [...byCountry.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([countryId, agentIds]) => ({ countryId, agentIds }));

    return { valid: violations.length === 0, violations };
  }
}

export const agentAssignmentPolicy = new AgentAssignmentPolicy();
