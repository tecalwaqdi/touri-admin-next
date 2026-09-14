/**
 * Phase 5B — Production write gate for Agent Controlled Writes.
 * Requires GLOBAL_PRODUCTION_WRITE_ENABLED AND PRODUCTION_WRITE_ENABLED
 * AND AGENT_WRITE_ENABLED. All remain false → PRODUCTION_WRITE_DISABLED
 * (no Firestore mutation attempt).
 */

import type { AgentWriteFlagGate } from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";

/** Hard lock — Phase 5B never activates Production agent writes. */
export const AGENT_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE = false as const;

function productionHardLockActive(): boolean {
  // Indirection avoids TS narrowing `false as const` against `true`.
  return AGENT_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE === (false as boolean);
}

export function areAgentProductionWritesEnabled(
  flags: AgentWriteFlagGate,
): boolean {
  if (!productionHardLockActive()) {
    return (
      flags.GLOBAL_PRODUCTION_WRITE_ENABLED === true &&
      flags.PRODUCTION_WRITE_ENABLED === true &&
      flags.AGENT_WRITE_ENABLED === true
    );
  }
  return false;
}

/**
 * Gate for Production repository path.
 * Fake/emulator paths must NOT call this as a success gate — they use offline allow.
 */
export function assertAgentProductionWriteEnabled(
  flags: AgentWriteFlagGate,
): void {
  if (
    !flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    !flags.PRODUCTION_WRITE_ENABLED ||
    !flags.AGENT_WRITE_ENABLED
  ) {
    throw new AgentWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED, PRODUCTION_WRITE_ENABLED, and AGENT_WRITE_ENABLED required",
    );
  }
  if (productionHardLockActive()) {
    throw new AgentWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "Agent Controlled Writes Production path hard-disabled (Phase 5B)",
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
