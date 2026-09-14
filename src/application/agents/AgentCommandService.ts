import type { Agent, AgentAssignmentHistory } from "@/types/agent";
import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";
import type { AgentRepository } from "@/repositories/interfaces/AgentRepository";
import { AuditService } from "@/audit/AuditService";
import type { AuthUser } from "@/types/auth";
import { assertPermission } from "@/permissions/guards";

export class AgentCommandService {
  constructor(
    private readonly agents: AgentRepository & {
      save?(agent: Agent): Promise<Agent>;
      appendHistory?(history: AgentAssignmentHistory): Promise<void>;
    },
    private readonly audit: AuditService,
  ) {}

  async attemptActivate(
    actor: AuthUser,
    input: {
      agentId: string;
      countryId: string;
      correlationId: string;
      effectiveFromUtc?: string;
    },
  ): Promise<{ ok: true; agent: Agent } | { ok: false; code: string; message: string }> {
    assertPermission(actor.permissions, "agents:read");
    const existing = await this.agents.listByCountry(input.countryId);
    const agent = await this.agents.getById(input.agentId);
    if (!agent) {
      return { ok: false, code: "NOT_FOUND", message: "Agent not found" };
    }

    const decision = agentAssignmentPolicy.canActivateAgent({
      countryId: input.countryId,
      agentId: input.agentId,
      agentStatus: "inactive",
      existingAgents: existing,
    });

    if (!decision.allowed) {
      await this.audit.record({
        actorUserId: actor.id,
        actorRole: actor.role,
        action: "agent_assignment_attempt_rejected",
        resourceType: "agent",
        resourceId: input.agentId,
        reason: decision.message,
        afterSnapshot: {
          code: decision.code,
          existingActiveAgentId: decision.existingActiveAgentId,
        },
        correlationId: input.correlationId,
      });
      return { ok: false, code: decision.code, message: decision.message };
    }

    // Activation persistence is optional in Phase 2 synthetic API — history recorded when adapter supports it.
    if (this.agents.save) {
      const updated: Agent = {
        ...agent,
        status: "active",
        activeFromUtc: input.effectiveFromUtc ?? new Date().toISOString(),
        activeToUtc: null,
      };
      await this.agents.save(updated);
      if (this.agents.appendHistory) {
        await this.agents.appendHistory({
          id: `hist_${input.agentId}_${Date.now()}`,
          countryId: input.countryId,
          previousAgentId: null,
          newAgentId: input.agentId,
          reason: "Synthetic activation",
          approvedBy: actor.id,
          endedPreviousAtUtc: null,
          startedNewAtUtc: updated.activeFromUtc!,
          createdAtUtc: new Date().toISOString(),
        });
      }
      return { ok: true, agent: updated };
    }

    return { ok: true, agent };
  }
}
