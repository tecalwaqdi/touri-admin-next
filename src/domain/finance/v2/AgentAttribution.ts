/**
 * Agent attribution (D-08).
 * ONE COUNTRY = ONE ACTIVE AGENT for *new* quote attribution.
 * Historical: snapshot or unknown_historical — never current country agent.
 */

import {
  resolveHistoricalAgentAttribution,
  type AgentAttribution,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import { percentOfMinorHalfUp } from "@/domain/finance/v2/CalculationPipeline";

export {
  resolveHistoricalAgentAttribution,
  type AgentAttribution,
  type AgentAttributionStatus,
} from "@/domain/finance/v2/FinanceImplementationContracts";

export type CountryActiveAgentRegistry = {
  /** countryId → active agentId (exactly one when present). */
  activeByCountry: Map<string, string>;
};

export function createCountryActiveAgentRegistry(): CountryActiveAgentRegistry {
  return { activeByCountry: new Map() };
}

/**
 * Fail-closed: activating a second agent for the same country throws.
 * Cross-country activation of the same agent is allowed only if product permits;
 * this registry enforces one-active-per-country.
 */
export function setActiveCountryAgent(
  registry: CountryActiveAgentRegistry,
  countryId: string,
  agentId: string,
): void {
  const existing = registry.activeByCountry.get(countryId);
  if (existing && existing !== agentId) {
    throw new Error(`one_country_one_active_agent:${countryId}`);
  }
  registry.activeByCountry.set(countryId, agentId);
}

export function getActiveCountryAgent(
  registry: CountryActiveAgentRegistry,
  countryId: string,
): string | null {
  return registry.activeByCountry.get(countryId) ?? null;
}

/**
 * New Fake quote path only — requires explicit draft policy rate.
 * Never hardcodes 15%. productionApproved must stay false.
 */
export function attributeAgentForNewQuote(input: {
  countryId: string;
  registry: CountryActiveAgentRegistry;
  platformFeeMinor: bigint;
  /** Explicit policy percent of platform fee — must be provided by caller. */
  agentPercentOfPlatformFee: number;
  productionApproved?: boolean;
}): AgentAttribution {
  if (input.productionApproved === true) {
    throw new Error("agent_new_quote_attribution_not_production_approved");
  }
  const agentId = getActiveCountryAgent(input.registry, input.countryId);
  if (!agentId) {
    throw new Error(`no_active_agent_for_country:${input.countryId}`);
  }
  if (!Number.isFinite(input.agentPercentOfPlatformFee)) {
    throw new Error("agent_percent_policy_missing");
  }
  const amountMinor = percentOfMinorHalfUp(
    input.platformFeeMinor,
    input.agentPercentOfPlatformFee,
  );
  return {
    status: "active_country_at_quote",
    agentId,
    ratePercent: input.agentPercentOfPlatformFee,
    amountMinor,
    rateType: "percent_of_platform_fee",
  };
}

export function historicalOrUnknown(input: {
  snapshotAgentId?: string | null;
  snapshotAmountMinor?: bigint | number | null;
  snapshotRatePercent?: number | null;
  currentCountryAgentId?: string | null;
}): AgentAttribution {
  return resolveHistoricalAgentAttribution(input);
}
