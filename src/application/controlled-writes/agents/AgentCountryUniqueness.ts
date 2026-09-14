/**
 * Phase 5B — ONE COUNTRY = MAX ONE ACTIVE AGENT guard.
 * Server-side. No auto-deactivate / merge / pick.
 * Activate when another active exists → ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY.
 *
 * Country identity: aliases (SA ↔ saudi_arabia) collapse to one canonical bucket.
 * Unmapped non-empty IDs keep their own raw bucket (not invented mappings).
 */

import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";

export type ActiveAgentLookup = {
  findActiveAgentIdForCountry(countryId: string): Promise<string | null>;
};

/** Canonical bucket key for one-country-one-agent (aliases collapse). */
export function agentCountryBucketId(countryId: string): string {
  const trimmed = countryId.trim();
  if (!trimmed) {
    throw new AgentWriteError(
      "VALIDATION_FAILED",
      "countryId required for active-agent uniqueness check",
    );
  }
  return tryCanonicalCountryId(trimmed) ?? trimmed;
}

/**
 * Assert no other active Agent exists for the country.
 * Self (same agentId already active) is allowed (idempotent activate path
 * still blocked by state machine if already active).
 */
export async function assertNoOtherActiveAgentForCountry(input: {
  countryId: string;
  agentId: string;
  lookup: ActiveAgentLookup;
}): Promise<void> {
  const bucket = agentCountryBucketId(input.countryId);

  const existing = await input.lookup.findActiveAgentIdForCountry(bucket);
  if (existing != null && existing !== input.agentId) {
    throw new AgentWriteError(
      "ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY",
      `Country ${bucket} already has active agent ${existing} (no auto-deactivate)`,
    );
  }
}

/**
 * Synchronous in-memory uniqueness check used inside Fake apply (transaction).
 * Caller must resolve activeAgentId via the same bucket key.
 */
export function assertNoOtherActiveAgentSync(input: {
  countryId: string;
  agentId: string;
  activeAgentId: string | null | undefined;
}): void {
  const bucket = agentCountryBucketId(input.countryId);
  if (
    input.activeAgentId != null &&
    input.activeAgentId !== "" &&
    input.activeAgentId !== input.agentId
  ) {
    throw new AgentWriteError(
      "ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY",
      `Country ${bucket} already has active agent ${input.activeAgentId} (no auto-deactivate)`,
    );
  }
}
