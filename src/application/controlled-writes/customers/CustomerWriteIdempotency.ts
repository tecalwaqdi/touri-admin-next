/**
 * Phase 5C — Idempotency for Customer Controlled Writes.
 * Required key; same key+fingerprint → previous result (no second write);
 * conflict → IDEMPOTENCY_CONFLICT.
 */

import type {
  CustomerControlledWriteCommand,
  CustomerWriteCanonicalResponse,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

export type CustomerWriteIdempotencyRecord = {
  key: string;
  fingerprint: string;
  result: Extract<CustomerWriteCanonicalResponse, { ok: true }>;
  createdAtUtc: string;
};

export type CustomerWriteIdempotencyStore = {
  get(key: string): Promise<CustomerWriteIdempotencyRecord | null>;
  put(record: CustomerWriteIdempotencyRecord): Promise<void>;
};

export class InMemoryCustomerWriteIdempotencyStore
  implements CustomerWriteIdempotencyStore
{
  private readonly map = new Map<string, CustomerWriteIdempotencyRecord>();

  async get(key: string): Promise<CustomerWriteIdempotencyRecord | null> {
    return this.map.get(key) ?? null;
  }

  async put(record: CustomerWriteIdempotencyRecord): Promise<void> {
    this.map.set(record.key, record);
  }

  clear(): void {
    this.map.clear();
  }
}

export function validateCustomerIdempotencyKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new CustomerWriteError(
      "VALIDATION_FAILED",
      "idempotencyKey must be 8..128 chars",
    );
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new CustomerWriteError(
      "VALIDATION_FAILED",
      "idempotencyKey has invalid characters",
    );
  }
}

/** Non-PII fingerprint of command intent. */
export function buildCustomerWriteFingerprint(
  command: CustomerControlledWriteCommand,
): string {
  const reason = `${"reasonCode" in command ? (command.reasonCode ?? "") : ""}|${
    "note" in command ? (command.note ?? "") : ""
  }`;
  return [
    "customer",
    command.action,
    command.customerId,
    command.expectedCurrentState,
    command.preconditionToken,
    reason,
  ].join("|");
}

export async function checkCustomerWriteIdempotency(
  store: CustomerWriteIdempotencyStore,
  command: CustomerControlledWriteCommand,
): Promise<
  | { kind: "fresh"; fingerprint: string }
  | { kind: "replay"; record: CustomerWriteIdempotencyRecord }
> {
  validateCustomerIdempotencyKey(command.idempotencyKey);
  const fingerprint = buildCustomerWriteFingerprint(command);
  const existing = await store.get(command.idempotencyKey);
  if (!existing) return { kind: "fresh", fingerprint };
  if (existing.fingerprint === fingerprint) {
    return { kind: "replay", record: existing };
  }
  throw new CustomerWriteError(
    "IDEMPOTENCY_CONFLICT",
    "idempotencyKey reused with different command fingerprint",
  );
}
