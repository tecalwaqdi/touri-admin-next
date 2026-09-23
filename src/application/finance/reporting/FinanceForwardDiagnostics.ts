/**
 * Bounded order scan diagnostics for Finance Dashboard isolation counters.
 * Certified totals remain snapshot-only; these counts never invent money.
 */

import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import { classifyTripFinanceDisplayState } from "@/domain/finance/TripFinanceDisplayState";

export type FinanceForwardDiagnosticsPort = {
  listOrdersPage(input: {
    limit: number;
    cursor: string | null;
  }): Promise<{
    docs: Array<{ id: string; data: Record<string, unknown> }>;
    nextCursor: string | null;
  }>;
  getSnapshotExists(orderId: string): Promise<boolean>;
};

export type FinanceForwardDiagnostics = {
  certifiedSnapshotCount: number;
  historicalIncompleteCount: number;
  financialConflictCount: number;
  pendingUncollectedCount: number;
  certifiedReadyAwaitingSnapshotCount: number;
  ordersScanned: number;
  scanComplete: boolean;
  productionWrites: 0;
};

export async function collectFinanceForwardDiagnostics(input: {
  port: FinanceForwardDiagnosticsPort;
  maxPages?: number;
  pageSize?: number;
}): Promise<FinanceForwardDiagnostics> {
  const maxPages = Math.min(Math.max(1, input.maxPages ?? 4), 8);
  const pageSize = Math.min(Math.max(1, input.pageSize ?? 50), 50);

  let certifiedSnapshotCount = 0;
  let historicalIncompleteCount = 0;
  let financialConflictCount = 0;
  let pendingUncollectedCount = 0;
  let certifiedReadyAwaitingSnapshotCount = 0;
  let ordersScanned = 0;
  let cursor: string | null = null;
  let scanComplete = false;

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await input.port.listOrdersPage({ limit: pageSize, cursor });
    if (batch.docs.length === 0) {
      scanComplete = true;
      break;
    }
    for (const doc of batch.docs) {
      if (isFinanceQaOrPilotRecordId(doc.id)) continue;
      ordersScanned += 1;
      const snapExists = await input.port.getSnapshotExists(doc.id);
      const cls = classifyTripFinanceDisplayState({
        orderId: doc.id,
        data: doc.data,
        snapshotExists: snapExists,
      });
      switch (cls.state) {
        case "certified_snapshotted":
          certifiedSnapshotCount += 1;
          break;
        case "certified_ready":
          certifiedReadyAwaitingSnapshotCount += 1;
          break;
        case "historical_incomplete":
          historicalIncompleteCount += 1;
          break;
        case "historical_conflict":
          financialConflictCount += 1;
          break;
        case "pending_uncollected":
          pendingUncollectedCount += 1;
          break;
        default:
          break;
      }
    }
    cursor = batch.nextCursor;
    if (!cursor) {
      scanComplete = true;
      break;
    }
  }

  return {
    certifiedSnapshotCount,
    historicalIncompleteCount,
    financialConflictCount,
    pendingUncollectedCount,
    certifiedReadyAwaitingSnapshotCount,
    ordersScanned,
    scanComplete,
    productionWrites: 0,
  };
}
