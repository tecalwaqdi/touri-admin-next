/**
 * Phase 5B — Production write gate for Agent Controlled Writes.
 * Requires GLOBAL ∧ PRODUCTION ∧ AGENT. Env gates only — no code hard-lock.
 */

import type { AgentWriteFlagGate } from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";

/** Historical constant retained for inventory docs/tests. */
export const AGENT_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE = false as const;

export function areAgentProductionWritesEnabled(
  flags: AgentWriteFlagGate,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === true &&
    flags.PRODUCTION_WRITE_ENABLED === true &&
    flags.AGENT_WRITE_ENABLED === true
  );
}

/**
 * Gate for Production repository path.
 * Fake/emulator paths must NOT call this as a success gate — they use offline allow.
 */
export function assertAgentProductionWriteEnabled(
  flags: AgentWriteFlagGate,
): void {
  if (!areAgentProductionWritesEnabled(flags)) {
    throw new AgentWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED, PRODUCTION_WRITE_ENABLED, and AGENT_WRITE_ENABLED required",
    );
  }
}

export function snapshotAgentWriteFlags(
  flags: AgentWriteFlagGate,
): AgentWriteFlagGate {
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: flags.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: flags.PRODUCTION_WRITE_ENABLED,
    AGENT_WRITE_ENABLED: flags.AGENT_WRITE_ENABLED,
  };
}
