/**
 * FR7 Finance reporting source ports — interfaces only.
 * Presentation never talks to Firestore; adapters are server-side RO.
 */

import type { FinanceReportingSourceBundle } from "@/domain/finance/reporting/FinanceReportingTypes";
import type { FinanceReportingSourceMode } from "@/application/finance/reporting/FinanceReportingSourceMode";

export const FINANCE_REPORTING_RO_COLLECTIONS = [
  "finance_accounting_snapshots",
  "financial_settlements",
  "financial_settlement_payments",
  "finance_adjustments",
  "finance_refund_accounting",
  "finance_chargeback_accounting",
  "finance_payout_preparations",
] as const;

export type FinanceReportingRoCollection =
  (typeof FINANCE_REPORTING_RO_COLLECTIONS)[number];

/** Hard cap — no unbounded collection scans. */
export const FINANCE_REPORTING_RO_QUERY_LIMIT = 50 as const;

export type FinanceReportingSourceLoadQuery = {
  /** Canonical country ID when scoped; null = bounded unscoped pilot/set. */
  countryId?: string | null;
  limit?: number;
  settlementId?: string;
};

export type FinanceReportingSourceLoadResult = {
  mode: FinanceReportingSourceMode;
  bundle: FinanceReportingSourceBundle;
  productionReads: number;
  productionWrites: 0;
  firestoreMutations: 0;
};

/**
 * Loads a bounded FinanceReportingSourceBundle for FR7.
 * Implementations MUST NOT write / mutate Firestore.
 */
export interface FinanceReportingSourcePort {
  readonly mode: FinanceReportingSourceMode;
  load(
    query?: FinanceReportingSourceLoadQuery,
  ): Promise<FinanceReportingSourceLoadResult>;
}

export type FinanceReportingRoDoc = {
  id: string;
  exists: boolean;
  data: Record<string, unknown> | null;
};

/**
 * Low-level RO Firestore surface for FR7 authoritative collections only.
 * get + bounded query. No set/update/delete/batch/transaction.
 */
export interface FinanceReportingRoFirestorePort {
  getDocument(
    collection: FinanceReportingRoCollection,
    documentId: string,
  ): Promise<FinanceReportingRoDoc>;
  queryByCountry(
    collection: FinanceReportingRoCollection,
    input: { countryId?: string | null; limit: number },
  ): Promise<FinanceReportingRoDoc[]>;
  queryBySettlement?(
    collection: "financial_settlement_payments" | "finance_adjustments",
    settlementId: string,
    limit: number,
  ): Promise<FinanceReportingRoDoc[]>;
  getCounter(): {
    productionReads: number;
    productionWrites: 0;
    firestoreMutations: 0;
  };
}
