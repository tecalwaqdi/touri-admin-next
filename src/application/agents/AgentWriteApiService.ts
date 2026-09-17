/**
 * Admin Next Agents write API — ControlledWritesService only (no AgentCommandService).
 *
 * Gate order (API layer):
 * auth (route) → Agent write gate (no resource I/O) → resource lookup →
 * command build → ControlledWritesService pipeline
 */

import type { AuthUser } from "@/types/auth";
import type { ControlledWritesService } from "@/application/controlled-writes/ControlledWritesService";
import type { AgentWriteLoadPort } from "@/application/controlled-writes/agents/AgentWritePreconditions";
import {
  createActivateAgentCommand,
  createDeactivateAgentCommand,
  createSuspendAgentCommand,
} from "@/application/controlled-writes/agents/AgentWriteCommands";
import type {
  AgentControlledWriteAction,
  AgentDeactivateReasonCode,
  AgentSuspendReasonCode,
  AgentWriteCanonicalResponse,
  ProvenAgentOperationalState,
  VerifiedAgentWriteActor,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import type { FacadeDenialResponse } from "@/application/controlled-writes/ControlledWritesService";
import { getRepositories } from "@/repositories/container";
import {
  getAdminControlledWritesRuntime,
} from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import type { Agent } from "@/types/agent";

export type AgentWriteApiAction = AgentControlledWriteAction;

export type AgentWriteApiInput = {
  action: AgentWriteApiAction;
  agentId: string;
  expectedCurrentState: ProvenAgentOperationalState;
  reasonCode?: string;
  note?: string;
  idempotencyKey: string;
  correlationId: string;
};

function toActor(user: AuthUser): VerifiedAgentWriteActor {
  return {
    uid: user.id,
    role: user.role,
    permissions: user.permissions,
    scope: user.scope,
  };
}

export class AgentWriteApiService {
  constructor(
    private readonly controlledWrites: ControlledWritesService,
    private readonly loadPort: AgentWriteLoadPort,
    private readonly agentsRead: {
      getById(id: string): Promise<Agent | null>;
    },
  ) {}

  async execute(
    actor: AuthUser,
    input: AgentWriteApiInput,
  ): Promise<
    | {
        ok: true;
        result: Extract<AgentWriteCanonicalResponse, { ok: true }>;
        agent: Agent;
      }
    | {
        ok: false;
        result:
          | Extract<AgentWriteCanonicalResponse, { ok: false }>
          | FacadeDenialResponse;
      }
  > {
    // Domain / production write gates BEFORE any Agent repo existence read.
    // Existing and nonexistent Agent ids must return the same gated-off response.
    const gateDenial = this.controlledWrites.denyAgentWriteIfDisabled(
      input.action,
    );
    if (gateDenial) {
      return { ok: false, result: gateDenial };
    }

    const loaded = await this.loadPort.loadForWrite(input.agentId);
    if (!loaded || !loaded.exists) {
      return {
        ok: false,
        result: {
          ok: false,
          status: "denied",
          code: "AGENT_NOT_FOUND",
          message: `Agent ${input.agentId} not found`,
          action: input.action,
          agentId: input.agentId,
          productionWriteExecuted: false,
        },
      };
    }

    const countryId = loaded.countryId;
    if (!countryId) {
      return {
        ok: false,
        result: {
          ok: false,
          status: "denied",
          code: "SCOPE_DENIED",
          message: "Agent countryId missing",
          action: input.action,
          agentId: input.agentId,
          productionWriteExecuted: false,
        },
      };
    }

    const base = {
      actor: toActor(actor),
      agentId: input.agentId,
      countryId,
      expectedCurrentState: input.expectedCurrentState,
      preconditionToken: loaded.preconditionToken,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    };

    let command;
    switch (input.action) {
      case "activate":
        command = createActivateAgentCommand(base);
        break;
      case "deactivate":
        command = createDeactivateAgentCommand({
          ...base,
          reasonCode:
            (input.reasonCode as AgentDeactivateReasonCode) || "operational",
          note: input.note,
        });
        break;
      case "suspend":
        command = createSuspendAgentCommand({
          ...base,
          reasonCode: (input.reasonCode as AgentSuspendReasonCode) || "other",
          note: input.note,
        });
        break;
    }

    const outcome = await this.controlledWrites.executeAgentCommand(command);
    if (!outcome.ok) {
      return { ok: false, result: outcome };
    }

    const agent = await this.agentsRead.getById(input.agentId);
    if (!agent) {
      return {
        ok: false,
        result: {
          ok: false,
          status: "failed",
          code: "INTERNAL_WRITE_FAILURE",
          message: "Agent missing after apply",
          action: input.action,
          agentId: input.agentId,
          productionWriteExecuted: false,
        },
      };
    }

    return { ok: true, result: outcome, agent };
  }
}

let apiSingleton: AgentWriteApiService | null = null;

export function getAgentWriteApiService(): AgentWriteApiService {
  if (!apiSingleton) {
    const repos = getRepositories();
    const runtime = getAdminControlledWritesRuntime({
      drivers: repos.drivers,
      agents: repos.agents,
      customers: repos.customers,
    });
    apiSingleton = new AgentWriteApiService(
      runtime.service,
      runtime.agentLoadPort,
      repos.agents,
    );
  }
  return apiSingleton;
}

export function resetAgentWriteApiServiceForTests(): void {
  apiSingleton = null;
}
