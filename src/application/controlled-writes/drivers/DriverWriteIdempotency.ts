/**
 * Phase 5A — Idempotency for Driver Controlled Writes.
 * Required key; same key+fingerprint → previous result (no second write);
 * conflict → IDEMPOTENCY_CONFLICT.
 */

import type {
  DriverControlledWriteCommand,
  DriverWriteCanonicalResponse,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";

export type DriverWriteIdempotencyRecord = {
  key: string;
  fingerprint: string;
  result: Extract<DriverWriteCanonicalResponse, { ok: true }>;
  createdAtUtc: string;
};

export type DriverWriteIdempotencyStore = {
  get(key: string): Promise<DriverWriteIdempotencyRecord | null>;
  put(record: DriverWriteIdempotencyRecord): Promise<void>;
};

export class InMemoryDriverWriteIdempotencyStore
  implements DriverWriteIdempotencyStore
{
  private readonly map = new Map<string, DriverWriteIdempotencyRecord>();

  async get(key: string): Promise<DriverWriteIdempotencyRecord | null> {
    return this.map.get(key) ?? null;
  }

  async put(record: DriverWriteIdempotencyRecord): Promise<void> {
    this.map.set(record.key, record);
  }

  clear(): void {
    this.map.clear();
  }
}

export function validateDriverIdempotencyKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new DriverWriteError(
      "VALIDATION_FAILED",
      "idempotencyKey must be 8..128 chars",
    );
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new DriverWriteError(
      "VALIDATION_FAILED",
      "idempotencyKey has invalid characters",
    );
  }
}

/** Non-PII fingerprint of command intent. */
export function buildDriverWriteFingerprint(
  command: DriverControlledWriteCommand,
): string {
  const reason =
    command.action === "approve"
      ? ""
      : `${command.reasonCode}|${command.note ?? ""}`;
  return [
    "driver",
    command.action,
    command.driverId,
    command.expectedCurrentState,
    command.preconditionToken,
    reason,
  ].join("|");
}

export async function checkDriverWriteIdempotency(
  store: DriverWriteIdempotencyStore,
  command: DriverControlledWriteCommand,
): Promise<
  | { kind: "fresh"; fingerprint: string }
  | { kind: "replay"; record: DriverWriteIdempotencyRecord }
> {
  validateDriverIdempotencyKey(command.idempotencyKey);
  const fingerprint = buildDriverWriteFingerprint(command);
  const existing = await store.get(command.idempotencyKey);
  if (!existing) return { kind: "fresh", fingerprint };
  if (existing.fingerprint === fingerprint) {
    return { kind: "replay", record: existing };
  }
  throw new DriverWriteError(
    "IDEMPOTENCY_CONFLICT",
    "idempotencyKey reused with different command fingerprint",
  );
}
