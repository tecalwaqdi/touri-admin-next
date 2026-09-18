/**
 * Phase 5B — Idempotency for Agent Controlled Writes.
 * Required key; same key+fingerprint → previous result (no second write);
 * conflict → IDEMPOTENCY_CONFLICT.
 */

import type {
  AgentControlledWriteCommand,
  AgentWriteCanonicalResponse,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";

export type AgentWriteIdempotencyRecord = {
  key: string;
  fingerprint: string;
  result: Extract<AgentWriteCanonicalResponse, { ok: true }>;
  createdAtUtc: string;
};

export type AgentWriteIdempotencyStore = {
  get(key: string): Promise<AgentWriteIdempotencyRecord | null>;
  put(record: AgentWriteIdempotencyRecord): Promise<void>;
};

export class InMemoryAgentWriteIdempotencyStore
  implements AgentWriteIdempotencyStore
{
  private readonly map = new Map<string, AgentWriteIdempotencyRecord>();

  async get(key: string): Promise<AgentWriteIdempotencyRecord | null> {
    return this.map.get(key) ?? null;
  }

  async put(record: AgentWriteIdempotencyRecord): Promise<void> {
    this.map.set(record.key, record);
  }

  clear(): void {
    this.map.clear();
  }
}

export function validateAgentIdempotencyKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new AgentWriteError(
      "VALIDATION_FAILED",
      "idempotencyKey must be 8..128 chars",
    );
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new AgentWriteError(
      "VALIDATION_FAILED",
      "idempotencyKey has invalid characters",
    );
  }
}

/** Non-PII fingerprint of command intent.
 * Omits preconditionToken — token changes after a successful write and must
 * not break same-key replay across serverless instances.
 */
export function buildAgentWriteFingerprint(
  command: AgentControlledWriteCommand,
): string {
  const reason =
    command.action === "activate"
      ? ""
      : `${"reasonCode" in command ? (command.reasonCode ?? "") : ""}|${
          "note" in command ? (command.note ?? "") : ""
        }`;
  return [
    "agent",
    command.action,
    command.agentId,
    command.countryId,
    command.expectedCurrentState,
    reason,
  ].join("|");
}

export async function checkAgentWriteIdempotency(
  store: AgentWriteIdempotencyStore,
  command: AgentControlledWriteCommand,
): Promise<
  | { kind: "fresh"; fingerprint: string }
  | { kind: "replay"; record: AgentWriteIdempotencyRecord }
> {
  validateAgentIdempotencyKey(command.idempotencyKey);
  const fingerprint = buildAgentWriteFingerprint(command);
  const existing = await store.get(command.idempotencyKey);
  if (!existing) return { kind: "fresh", fingerprint };
  if (existing.fingerprint === fingerprint) {
    return { kind: "replay", record: existing };
  }
  throw new AgentWriteError(
    "IDEMPOTENCY_CONFLICT",
    "idempotencyKey reused with different command fingerprint",
  );
}
