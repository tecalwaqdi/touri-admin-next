/**
 * Phase 5 — idempotency contract for Controlled Writes.
 * Keys are opaque; store outcome fingerprints without raw PII.
 */

import type { ControlledWriteStageResult } from "@/application/controlled-writes/ControlledWriteTypes";

export type IdempotencyRecord = {
  key: string;
  resource: string;
  action: string;
  resourceId: string;
  /** Hash/fingerprint of command intent — no PII. */
  commandFingerprint: string;
  outcome: "applied" | "denied" | "failed";
  outcomeCode?: string;
  createdAtUtc: string;
};

export type IdempotencyStore = {
  get(key: string): Promise<IdempotencyRecord | null>;
  put(record: IdempotencyRecord): Promise<void>;
};

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.map.get(key) ?? null;
  }

  async put(record: IdempotencyRecord): Promise<void> {
    this.map.set(record.key, record);
  }
}

export function buildCommandFingerprint(input: {
  resource: string;
  action: string;
  resourceId: string;
  countryId: string;
  reasonCode?: string;
  preconditionToken?: string;
}): string {
  // Deterministic non-PII fingerprint for conflict detection.
  return [
    input.resource,
    input.action,
    input.resourceId,
    input.countryId,
    input.reasonCode ?? "",
    input.preconditionToken ?? "",
  ].join("|");
}

export function validateIdempotencyKey(key: string): ControlledWriteStageResult {
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    return {
      stage: "idempotency",
      ok: false,
      code: "IDEMPOTENCY_CONFLICT",
      detail: "idempotencyKey must be 8..128 chars",
    };
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return {
      stage: "idempotency",
      ok: false,
      code: "IDEMPOTENCY_CONFLICT",
      detail: "idempotencyKey has invalid characters",
    };
  }
  return { stage: "idempotency", ok: true };
}

export async function checkIdempotencyReplay(
  store: IdempotencyStore,
  key: string,
  fingerprint: string,
): Promise<
  | { kind: "fresh" }
  | { kind: "replay"; record: IdempotencyRecord }
  | { kind: "conflict"; record: IdempotencyRecord }
> {
  const existing = await store.get(key);
  if (!existing) return { kind: "fresh" };
  if (existing.commandFingerprint === fingerprint) {
    return { kind: "replay", record: existing };
  }
  return { kind: "conflict", record: existing };
}
