/**
 * Admin Next Agents write bridge — reuses FakeAgentWriteRepository +
 * ControlledWritesService. Syncs operational status back to the in-memory
 * Agent read model. No UI→Firestore. No Driver pilot path.
 */

import type { Agent, AgentStatus } from "@/types/agent";
import type { InMemoryAgentRepository } from "@/repositories/in-memory/InMemoryAgentRepository";
import {
  FakeAgentWriteRepository,
  type AgentWriteRepository,
} from "@/application/controlled-writes/agents/AgentWriteRepository";
import type { AgentWriteLoadPort } from "@/application/controlled-writes/agents/AgentWritePreconditions";
import type {
  AgentWriteApplyInput,
  AgentWriteApplyResult,
  AgentWriteSnapshot,
  ProvenAgentOperationalState,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import { toProvenAgentState } from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";

function statusFor(state: ProvenAgentOperationalState): AgentStatus {
  switch (state) {
    case "active":
      return "active";
    case "suspended":
      return "suspended";
    case "inactive":
    case "pending":
    default:
      return "inactive";
  }
}

function snapshotFromAgent(agent: Agent, token: string): AgentWriteSnapshot {
  const operationalState = toProvenAgentState(agent.status);
  return {
    agentId: agent.id,
    exists: true,
    isOperationalAgent: true,
    excludedNonAgent: false,
    operationalState,
    accountEnabled: operationalState === "suspended" ? "disabled" : "enabled",
    countryId: agent.countryId,
    countryScopeKind: "mapped",
    preconditionToken: token,
  };
}

function initialToken(agent: Agent): string {
  return `im_v0_${agent.id}_${agent.status}`;
}

export class BridgedAgentWriteRepository implements AgentWriteRepository {
  readonly kind = "fake_agent_write" as const;

  constructor(
    private readonly fake: FakeAgentWriteRepository,
    private readonly agents: InMemoryAgentRepository,
  ) {}

  async apply(input: AgentWriteApplyInput): Promise<AgentWriteApplyResult> {
    const result = await this.fake.apply(input);
    const current = await this.agents.getById(result.agentId);
    if (!current) {
      throw new AgentWriteError(
        "AGENT_NOT_FOUND",
        `Bridge sync missing ${result.agentId}`,
      );
    }
    const nextStatus = statusFor(result.toState);
    await this.agents.save({
      ...current,
      status: nextStatus,
      activeFromUtc:
        nextStatus === "active"
          ? current.activeFromUtc ?? result.appliedAtUtc
          : current.activeFromUtc,
      activeToUtc:
        nextStatus === "active" ? null : result.appliedAtUtc,
    });
    return result;
  }
}

export class BridgedAgentWriteLoadPort implements AgentWriteLoadPort {
  constructor(
    private readonly fake: FakeAgentWriteRepository,
    private readonly agents: InMemoryAgentRepository,
  ) {}

  async ensureSeeded(agentId: string): Promise<AgentWriteSnapshot | null> {
    const existing = this.fake.get(agentId);
    if (existing) return existing;

    const agent = await this.agents.getById(agentId);
    if (!agent) return null;

    const snap = snapshotFromAgent(agent, initialToken(agent));
    this.fake.seed(snap);
    return snap;
  }

  async loadForWrite(agentId: string): Promise<AgentWriteSnapshot | null> {
    return this.ensureSeeded(agentId);
  }

  async findActiveAgentIdForCountry(countryId: string): Promise<string | null> {
    // Prefer Fake index after seeds; fall back to in-memory list.
    const fromFake = this.fake.findActiveAgentIdForCountry(countryId);
    if (fromFake) return fromFake;
    const list = await this.agents.listByCountry(countryId);
    const active = list.find((a) => a.status === "active");
    return active?.id ?? null;
  }
}

export function createAgentWriteBridge(agents: InMemoryAgentRepository): {
  fake: FakeAgentWriteRepository;
  repository: BridgedAgentWriteRepository;
  loadPort: BridgedAgentWriteLoadPort;
} {
  const fake = new FakeAgentWriteRepository();
  const loadPort = new BridgedAgentWriteLoadPort(fake, agents);
  const repository = new BridgedAgentWriteRepository(fake, agents);
  return { fake, repository, loadPort };
}
