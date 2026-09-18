/**
 * Durable Agent write idempotency — WIF REST on `admin_next_cw_idempotency`.
 * Required for Production serverless: in-memory store does not survive instances.
 */

import type {
  AgentWriteIdempotencyRecord,
  AgentWriteIdempotencyStore,
} from "@/application/controlled-writes/agents/AgentWriteIdempotency";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import {
  createWifWritePortOrThrow,
} from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { PHASE_5M_IDEMPOTENCY_COLLECTION } from "@/application/controlled-writes/pilot/Phase5MIamDerivation";

export class ProductionAgentWriteIdempotencyStore
  implements AgentWriteIdempotencyStore
{
  readonly kind = "production_agent_write_idempotency" as const;

  constructor(private readonly port: ProductionFirestoreWritePort) {}

  async get(key: string): Promise<AgentWriteIdempotencyRecord | null> {
    const id = String(key || "").trim();
    if (!id) return null;
    const snap = await this.port.getDocument(PHASE_5M_IDEMPOTENCY_COLLECTION, id);
    if (!snap.exists || !snap.data) return null;
    const data = snap.data;
    if (
      typeof data.key !== "string" ||
      typeof data.fingerprint !== "string" ||
      !data.result ||
      typeof data.result !== "object"
    ) {
      return null;
    }
    return {
      key: data.key,
      fingerprint: data.fingerprint,
      result: data.result as AgentWriteIdempotencyRecord["result"],
      createdAtUtc:
        typeof data.createdAtUtc === "string"
          ? data.createdAtUtc
          : new Date().toISOString(),
    };
  }

  async put(record: AgentWriteIdempotencyRecord): Promise<void> {
    const id = String(record.key || "").trim();
    if (!id) return;
    const payload: Record<string, unknown> = {
      key: record.key,
      fingerprint: record.fingerprint,
      result: record.result,
      createdAtUtc: record.createdAtUtc,
      resource: "agent",
    };
    try {
      await this.port.createDocument(PHASE_5M_IDEMPOTENCY_COLLECTION, id, payload);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code !== "ALREADY_EXISTS") throw err;
      await this.port.updateDocument(
        PHASE_5M_IDEMPOTENCY_COLLECTION,
        id,
        payload,
        { expectedUpdateTime: null, allowCreate: false },
      );
    }
  }
}

export function createProductionAgentWriteIdempotencyStore(
  port?: ProductionFirestoreWritePort,
): ProductionAgentWriteIdempotencyStore {
  return new ProductionAgentWriteIdempotencyStore(
    port ?? createWifWritePortOrThrow("ops_writer"),
  );
}
