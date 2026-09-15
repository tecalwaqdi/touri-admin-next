/**
 * Countries read model for Admin Geography screen.
 * One country = at most one active agent (domain invariant surfaced in UI).
 */

import type { AgentRepository } from "@/repositories/interfaces/AgentRepository";
import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";
import {
  buildGeographyCountryPresentation,
  diagnoseDuplicateActiveAgents,
  diagnoseSuspiciousActiveAgent,
} from "@/domain/geography/GeographyPresentation";
import type { GeographyCountryListItem } from "@/application/geography/geographyListDtos";

/** @deprecated Prefer GeographyCountryListItem — retained for AgentsPage / PC-1 callers. */
export type CountryListItem = {
  countryId: string;
  /** Evidence-backed display name only — null when missing (never fabricate). */
  displayName: string | null;
  displayNameAr?: string | null;
  displayNameEn?: string | null;
  canonicalCountryId: string | null;
  activeAgentId: string | null;
  activeAgentName: string | null;
  inactiveAgentCount: number;
  invariant: "pass" | "fail_multiple_active" | "no_active_agent";
  agentInvariantState?: GeographyCountryListItem["agentInvariantState"];
  currencyHint: string | null;
  currencyCode?: string | null;
  dataQualityWarnings: Array<{
    code: string;
    messageEn: string;
    messageAr: string;
  }>;
  dataQualityIssues?: GeographyCountryListItem["dataQualityIssues"];
  dqSeverity?: GeographyCountryListItem["dqSeverity"];
  testOrNoncanonical: boolean;
  identityClass?: GeographyCountryListItem["identityClass"];
  recordClass?: GeographyCountryListItem["recordClass"];
  citiesCount?: GeographyCountryListItem["citiesCount"];
  landmarksCount?: GeographyCountryListItem["landmarksCount"];
};

const CURRENCY_HINT: Record<string, string> = {
  SA: "SAR",
  AE: "AED",
  EG: "EGP",
  KW: "KWD",
  JO: "JOD",
  saudi_arabia: "SAR",
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
        const presentation = buildGeographyCountryPresentation({ countryId });
        const warnings = [...presentation.warnings];
        const dup = diagnoseDuplicateActiveAgents(active.length);
        if (dup) warnings.push(dup);
        const suspicious = diagnoseSuspiciousActiveAgent({
          agentName: active[0]?.name,
        });
        if (suspicious && active.length === 1) warnings.push(suspicious);
        return {
          countryId,
          displayName: presentation.displayName,
          canonicalCountryId: presentation.canonicalCountryId,
          activeAgentId: active[0]?.id ?? null,
          activeAgentName: active[0]?.name ?? null,
          inactiveAgentCount: agents.filter((a) => a.status !== "active").length,
          invariant,
          currencyHint: CURRENCY_HINT[countryId] ?? null,
          dataQualityWarnings: warnings,
          testOrNoncanonical: presentation.testOrNoncanonical,
        };
      })
      .sort((a, b) => a.countryId.localeCompare(b.countryId));

    return { items, synthetic: true };
  }
}
