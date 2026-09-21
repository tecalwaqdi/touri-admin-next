import type { Agent, AgentAssignmentHistory } from "@/types/agent";
import type { ListParams } from "@/types/common";
import type { AgentRepository } from "@/repositories/interfaces/AgentRepository";
import { paginate } from "@/repositories/in-memory/paginate";
import { seedAgentHistory, seedAgents } from "@/test/fixtures/seed";
import { agentCountryBucketId } from "@/application/controlled-writes/agents/AgentCountryUniqueness";

export class InMemoryAgentRepository implements AgentRepository {
  private agents: Agent[];
  private history: AgentAssignmentHistory[];

  constructor(
    agents: Agent[] = seedAgents.map((a) => structuredClone(a)),
    history: AgentAssignmentHistory[] = seedAgentHistory.map((h) => structuredClone(h)),
  ) {
    this.agents = agents;
    this.history = history;
  }

  async list(params: ListParams = {}) {
    let filtered = [...this.agents];
    if (params.countryId) {
      filtered = filtered.filter((a) => a.countryId === params.countryId);
    }
    if (params.status) {
      filtered = filtered.filter((a) => a.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter((a) => a.name.toLowerCase().includes(q));
    }
    return paginate(filtered, params.page, params.pageSize);
  }

  async getById(id: string) {
    return this.agents.find((a) => a.id === id) ?? null;
  }

  async listByCountry(countryId: string) {
    return this.agents.filter((a) => a.countryId === countryId);
  }

  /** Active agent for canonical country bucket (SA ↔ saudi_arabia). */
  async findActiveAgentIdForCountryBucket(bucket: string): Promise<string | null> {
    for (const a of this.agents) {
      if (a.status !== "active") continue;
      try {
        if (agentCountryBucketId(a.countryId) === bucket) return a.id;
      } catch {
        continue;
      }
    }
    return null;
  }

  async listAssignmentHistory(countryId: string) {
    return this.history.filter((h) => h.countryId === countryId);
  }

  async save(agent: Agent) {
    const idx = this.agents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) this.agents[idx] = agent;
    else this.agents.push(agent);
    return agent;
  }

  async appendHistory(entry: AgentAssignmentHistory) {
    this.history.unshift(entry);
  }
}
