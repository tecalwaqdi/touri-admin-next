/**
 * Phase 5B — Country scope for Agent Controlled Writes.
 * Uses canonical Agent country from snapshot — no country inference.
 * not_represented / unknown / unmapped → SCOPE_DENIED for country-scoped actors
 * unless the actor has global scope.
 * Country-scoped: actor.countryId must include agent.countryId.
 */

import { isWithinScope } from "@/permissions/rbac";
import type {
  AgentWriteSnapshot,
  VerifiedAgentWriteActor,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";

const UNSCOPED_COUNTRY_KINDS = new Set([
  "not_represented",
  "unknown",
  "unmapped",
]);

export function assertAgentWriteScope(
  actor: VerifiedAgentWriteActor,
  snapshot: AgentWriteSnapshot,
): void {
  if (actor.scope.type === "global") {
    return;
  }

  if (UNSCOPED_COUNTRY_KINDS.has(snapshot.countryScopeKind)) {
    throw new AgentWriteError(
      "SCOPE_DENIED",
      `Agent country ${snapshot.countryScopeKind} — country-scoped actors cannot mutate`,
    );
  }

  if (!snapshot.countryId?.trim()) {
    throw new AgentWriteError(
      "SCOPE_DENIED",
      "Agent countryId missing — cannot authorize country-scoped write",
    );
  }

  const ok = isWithinScope(actor.scope, {
    countryId: snapshot.countryId,
    agentId: snapshot.agentId,
  });

  if (!ok) {
    throw new AgentWriteError(
      "SCOPE_DENIED",
      `Actor scope ${actor.scope.type} cannot mutate agent/${snapshot.agentId} in ${snapshot.countryId}`,
    );
  }
}
