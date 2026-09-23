/**
 * WIF adapters for Production FR1 accounting snapshot materialization.
 * Reads orders via WIF-native RO; snapshots/audit/idempotency via finance_writer WIF REST.
 */

import {
  FINANCE_FR1_AUDIT_COLLECTION,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import type {
  AccountingSnapshotCreateResult,
  AccountingSnapshotMaterializePorts,
  AccountingSnapshotMaterializeReadPort,
  AccountingSnapshotMaterializeWritePort,
  AccountingSnapshotOrderDoc,
} from "@/application/finance/materialize/AccountingSnapshotMaterializePorts";
import { createWifNativeFirestoreRead } from "@/infrastructure/production/firestore/createWifNativeFirestoreReadTransport";
import {
  createWifWritePortOrThrow,
  type ProductionFirestoreWritePort,
} from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { omitUndefinedDeep } from "@/application/controlled-writes/omitUndefinedForFirestore";

function toOrderDoc(snap: {
  id: string;
  exists: boolean;
  data: Record<string, unknown> | null;
}): AccountingSnapshotOrderDoc {
  return {
    id: snap.id,
    exists: snap.exists,
    data: snap.exists ? snap.data : null,
  };
}

function mapCreateError(err: unknown): AccountingSnapshotCreateResult {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (
    code === "ALREADY_EXISTS" ||
    /ALREADY_EXISTS|already exists/i.test(msg)
  ) {
    return { ok: false, code: "ALREADY_EXISTS", message: msg };
  }
  return { ok: false, code: "CREATE_FAILED", message: msg };
}

export class WifAccountingSnapshotMaterializeReadPort
  implements AccountingSnapshotMaterializeReadPort
{
  constructor(
    private readonly orderClient: {
      getDocument(
        collection: string,
        documentId: string,
      ): Promise<{
        id: string;
        exists: boolean;
        data: Record<string, unknown> | null;
      }>;
      query(request: {
        collection: string;
        filters?: Array<{
          field: string;
          op: "==" | ">" | ">=" | "<" | "<=" | "in" | "array-contains";
          value: unknown;
        }>;
        orderBy?: Array<{ field: string; direction: "asc" | "desc" }>;
        limit: number;
        startAfterCursor?: string | null;
      }): Promise<{
        docs: Array<{
          id: string;
          exists: boolean;
          data: Record<string, unknown> | null;
        }>;
        nextCursor?: string | null;
      }>;
    },
    private readonly financePort: ProductionFirestoreWritePort,
  ) {}

  async getOrder(orderId: string): Promise<AccountingSnapshotOrderDoc> {
    const snap = await this.orderClient.getDocument("order", orderId);
    return toOrderDoc(snap);
  }

  async listRecentOrders(input: {
    limit: number;
  }): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const limit = Math.min(Math.max(1, input.limit), 50);
    // Prefer completed lifecycle; fall back to bounded latest if filter unsupported.
    try {
      const page = await this.orderClient.query({
        collection: "order",
        filters: [{ field: "status_code", op: "==", value: "completed" }],
        orderBy: [{ field: "data_order", direction: "desc" }],
        limit,
      });
      return page.docs
        .filter((d) => d.exists && d.data)
        .map((d) => ({ id: d.id, data: d.data! }));
    } catch {
      const page = await this.orderClient.query({
        collection: "order",
        orderBy: [{ field: "data_order", direction: "desc" }],
        limit,
      });
      return page.docs
        .filter((d) => d.exists && d.data)
        .map((d) => ({ id: d.id, data: d.data! }));
    }
  }

  /** Cursor pagination — all statuses; for historical Saudi dry-run only. */
  async listOrdersPage(input: {
    limit: number;
    cursor: string | null;
  }): Promise<{
    docs: Array<{ id: string; data: Record<string, unknown> }>;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(1, input.limit), 50);
    const page = await this.orderClient.query({
      collection: "order",
      orderBy: [{ field: "data_order", direction: "desc" }],
      limit,
      startAfterCursor: input.cursor,
    });
    const docs = page.docs
      .filter((d) => d.exists && d.data)
      .map((d) => ({ id: d.id, data: d.data! }));
    const nextCursor =
      page.nextCursor ??
      (docs.length >= limit ? docs[docs.length - 1]!.id : null);
    return { docs, nextCursor };
  }

  async getSnapshot(orderId: string): Promise<AccountingSnapshotOrderDoc> {
    const snap = await this.financePort.getDocument(
      FINANCE_FR1_SNAPSHOT_COLLECTION,
      orderId,
    );
    return toOrderDoc(snap);
  }

  async getIdempotency(docId: string): Promise<AccountingSnapshotOrderDoc> {
    const snap = await this.financePort.getDocument(
      FINANCE_FR1_IDEMPOTENCY_COLLECTION,
      docId,
    );
    return toOrderDoc(snap);
  }
}

export class WifAccountingSnapshotMaterializeWritePort
  implements AccountingSnapshotMaterializeWritePort
{
  constructor(private readonly financePort: ProductionFirestoreWritePort) {}

  async createSnapshot(
    orderId: string,
    data: Record<string, unknown>,
  ): Promise<AccountingSnapshotCreateResult> {
    try {
      await this.financePort.createDocument(
        FINANCE_FR1_SNAPSHOT_COLLECTION,
        orderId,
        omitUndefinedDeep(data) as Record<string, unknown>,
      );
      return { ok: true, id: orderId };
    } catch (err) {
      return mapCreateError(err);
    }
  }

  async createAudit(
    id: string,
    data: Record<string, unknown>,
  ): Promise<AccountingSnapshotCreateResult> {
    try {
      await this.financePort.createDocument(
        FINANCE_FR1_AUDIT_COLLECTION,
        id,
        omitUndefinedDeep(data) as Record<string, unknown>,
      );
      return { ok: true, id };
    } catch (err) {
      return mapCreateError(err);
    }
  }

  async createIdempotency(
    docId: string,
    data: Record<string, unknown>,
  ): Promise<AccountingSnapshotCreateResult> {
    try {
      await this.financePort.createDocument(
        FINANCE_FR1_IDEMPOTENCY_COLLECTION,
        docId,
        omitUndefinedDeep(data) as Record<string, unknown>,
      );
      return { ok: true, id: docId };
    } catch (err) {
      return mapCreateError(err);
    }
  }
}

export async function createWifAccountingSnapshotMaterializePorts(input?: {
  projectId?: string;
  financePort?: ProductionFirestoreWritePort;
}): Promise<AccountingSnapshotMaterializePorts> {
  const projectId = input?.projectId ?? FINANCE_FR1_EXPECTED_PROJECT_ID;
  const read = await createWifNativeFirestoreRead({
    projectId,
    requireWif:
      process.env.VERCEL_ENV === "production" ||
      process.env.APP_ENV === "production",
  });
  const financePort =
    input?.financePort ?? createWifWritePortOrThrow("finance_writer");
  return {
    read: new WifAccountingSnapshotMaterializeReadPort(
      read.client,
      financePort,
    ),
    write: new WifAccountingSnapshotMaterializeWritePort(financePort),
  };
}

/** In-memory Fake ports for unit tests. */
export function createFakeAccountingSnapshotMaterializePorts(seed?: {
  orders?: Record<string, Record<string, unknown>>;
  snapshots?: Record<string, Record<string, unknown>>;
}): AccountingSnapshotMaterializePorts {
  const orders = new Map(Object.entries(seed?.orders ?? {}));
  const snapshots = new Map(Object.entries(seed?.snapshots ?? {}));
  const audits = new Map<string, Record<string, unknown>>();
  const idem = new Map<string, Record<string, unknown>>();

  const read: AccountingSnapshotMaterializeReadPort = {
    async getOrder(orderId) {
      const data = orders.get(orderId) ?? null;
      return { id: orderId, exists: data != null, data };
    },
    async listRecentOrders({ limit }) {
      return [...orders.entries()]
        .slice(0, limit)
        .map(([id, data]) => ({ id, data }));
    },
    async getSnapshot(orderId) {
      const data = snapshots.get(orderId) ?? null;
      return { id: orderId, exists: data != null, data };
    },
    async getIdempotency(docId) {
      const data = idem.get(docId) ?? null;
      return { id: docId, exists: data != null, data };
    },
  };

  const write: AccountingSnapshotMaterializeWritePort = {
    async createSnapshot(orderId, data) {
      if (snapshots.has(orderId)) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "snapshot exists",
        };
      }
      snapshots.set(orderId, data);
      return { ok: true, id: orderId };
    },
    async createAudit(id, data) {
      if (audits.has(id)) {
        return { ok: false, code: "ALREADY_EXISTS", message: "audit exists" };
      }
      audits.set(id, data);
      return { ok: true, id };
    },
    async createIdempotency(docId, data) {
      if (idem.has(docId)) {
        return {
          ok: false,
          code: "ALREADY_EXISTS",
          message: "idempotency exists",
        };
      }
      idem.set(docId, data);
      return { ok: true, id: docId };
    },
  };

  return { read, write };
}
