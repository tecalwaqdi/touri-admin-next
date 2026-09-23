/**
 * Ports for Production FR1 accounting snapshot materialization.
 * Reads: order/ + existing snapshots. Writes: create-only snapshots/audit/idempotency.
 */

export type AccountingSnapshotOrderDoc = {
  id: string;
  exists: boolean;
  data: Record<string, unknown> | null;
};

export type AccountingSnapshotCreateResult =
  | { ok: true; id: string }
  | { ok: false; code: "ALREADY_EXISTS" | "CREATE_FAILED"; message: string };

export type AccountingSnapshotMaterializeReadPort = {
  getOrder(orderId: string): Promise<AccountingSnapshotOrderDoc>;
  /**
   * Bounded latest orders for scan (no write). Caller filters eligibility.
   * Prefer status_code == completed when the transport supports it.
   */
  listRecentOrders(input: {
    limit: number;
  }): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  /** Cursor pagination across all order statuses (historical dry-run). */
  listOrdersPage?(input: {
    limit: number;
    cursor: string | null;
  }): Promise<{
    docs: Array<{ id: string; data: Record<string, unknown> }>;
    nextCursor: string | null;
  }>;
  getSnapshot(orderId: string): Promise<AccountingSnapshotOrderDoc>;
  getIdempotency(docId: string): Promise<AccountingSnapshotOrderDoc>;
};

export type AccountingSnapshotMaterializeWritePort = {
  createSnapshot(
    orderId: string,
    data: Record<string, unknown>,
  ): Promise<AccountingSnapshotCreateResult>;
  createAudit(
    id: string,
    data: Record<string, unknown>,
  ): Promise<AccountingSnapshotCreateResult>;
  createIdempotency(
    docId: string,
    data: Record<string, unknown>,
  ): Promise<AccountingSnapshotCreateResult>;
};

export type AccountingSnapshotMaterializePorts = {
  read: AccountingSnapshotMaterializeReadPort;
  write: AccountingSnapshotMaterializeWritePort;
};
