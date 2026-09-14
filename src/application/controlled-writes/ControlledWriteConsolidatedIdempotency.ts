/**
 * Phase 5D — shared cross-resource idempotency contract.
 * Fingerprint includes actor / resource / target / action / expected / payload.
 * Same key + different fingerprint (incl. cross-resource) → IDEMPOTENCY_CONFLICT.
 */

import { ControlledWriteConsolidationError } from "@/application/controlled-writes/ControlledWriteErrorCatalog";

export type ConsolidatedIdempotencyRecord = {
  key: string;
  fingerprint: string;
  resource: "driver" | "agent" | "customer";
  action: string;
  targetId: string;
  actorUid: string;
  outcome: "applied" | "idempotent_replay";
  createdAtUtc: string;
};

export type ConsolidatedIdempotencyStore = {
  get(key: string): Promise<ConsolidatedIdempotencyRecord | null>;
  put(record: ConsolidatedIdempotencyRecord): Promise<void>;
};

export class InMemoryConsolidatedIdempotencyStore
  implements ConsolidatedIdempotencyStore
{
  private readonly map = new Map<string, ConsolidatedIdempotencyRecord>();

  async get(key: string): Promise<ConsolidatedIdempotencyRecord | null> {
    return this.map.get(key) ?? null;
  }

  async put(record: ConsolidatedIdempotencyRecord): Promise<void> {
    this.map.set(record.key, record);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

export function validateConsolidatedIdempotencyKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new ControlledWriteConsolidationError(
      "VALIDATION_FAILED",
      "idempotencyKey must be 8..128 chars",
    );
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new ControlledWriteConsolidationError(
      "VALIDATION_FAILED",
      "idempotencyKey has invalid characters",
    );
  }
}

/**
 * Shared fingerprint contract — no PII.
 * Includes actor so cross-actor reuse of the same key with different intent conflicts.
 */
export function buildConsolidatedFingerprint(input: {
  actorUid: string;
  resource: "driver" | "agent" | "customer";
  targetId: string;
  action: string;
  expectedCurrentState: string;
  preconditionToken: string;
  payload?: string;
}): string {
  return [
    input.actorUid,
    input.resource,
    input.targetId,
    input.action,
    input.expectedCurrentState,
    input.preconditionToken,
    input.payload ?? "",
  ].join("|");
}

export async function checkConsolidatedIdempotency(
  store: ConsolidatedIdempotencyStore,
  key: string,
  fingerprint: string,
): Promise<
  | { kind: "fresh" }
  | { kind: "replay"; record: ConsolidatedIdempotencyRecord }
> {
  validateConsolidatedIdempotencyKey(key);
  const existing = await store.get(key);
  if (!existing) return { kind: "fresh" };
  if (existing.fingerprint === fingerprint) {
    return { kind: "replay", record: existing };
  }
  throw new ControlledWriteConsolidationError(
    "IDEMPOTENCY_CONFLICT",
    "idempotencyKey reused with different command fingerprint (cross-resource aware)",
  );
}
