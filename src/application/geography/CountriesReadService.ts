/**
 * Countries read model for Admin Geography screen.
 * One country = at most one active agent (domain invariant surfaced in UI).
 */

import type { AgentRepository } from "@/repositories/interfaces/AgentRepository";
import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";

export type CountryListItem = {
  countryId: string;
  activeAgentId: string | null;
  activeAgentName: string | null;
  inactiveAgentCount: number;
  invariant: "pass" | "fail_multiple_active" | "no_active_agent";
  currencyHint: string | null;
};

const CURRENCY_HINT: Record<string, string> = {
  SA: "SAR",
  AE: "AED",
  EG: "EGP",
  KW: "KWD",
  JO: "JOD",
};

export class CountriesReadService {
  constructor(private readonly agents: AgentRepository) {}

  async list(): Promise<{ items: CountryListItem[]; synthetic: true }> {
    const page = await this.agents.list({ page: 1, pageSize: 200 });
    const byCountry = new Map<string, typeof page.items>();
    for (const agent of page.items) {
      const list = byCountry.get(agent.countryId) ?? [];
      list.push(agent);
      byCountry.set(agent.countryId, list);
    }

    const seedCheck = agentAssignmentPolicy.validateSeed(page.items);
    const violationSet = new Set(seedCheck.violations.map((v) => v.countryId));

    const items: CountryListItem[] = [...byCountry.entries()]
      .map(([countryId, agents]) => {
        const active = agents.filter((a) => a.status === "active");
        let invariant: CountryListItem["invariant"] = "no_active_agent";
        if (violationSet.has(countryId) || active.length > 1) {
          invariant = "fail_multiple_active";
        } else if (active.length === 1) {
          invariant = "pass";
        }
        return {
          countryId,
          activeAgentId: active[0]?.id ?? null,
          activeAgentName: active[0]?.name ?? null,
          inactiveAgentCount: agents.filter((a) => a.status !== "active").length,
          invariant,
          currencyHint: CURRENCY_HINT[countryId] ?? null,
        };
      })
      .sort((a, b) => a.countryId.localeCompare(b.countryId));

    return { items, synthetic: true };
  }
}
