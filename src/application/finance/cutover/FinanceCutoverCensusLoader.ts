/**
 * Full Production finance cutover census — READ-ONLY pagination.
 * Page size remains 50 (WIF hard cap); loops until complete or maxPages.
 * Never writes. Never deletes.
 */

import {
  FINANCE_REPORTING_RO_COLLECTIONS,
  FINANCE_REPORTING_RO_QUERY_LIMIT,
  type FinanceReportingRoDoc,
  type FinanceReportingRoFirestorePort,
} from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import { ProductionFinanceReportingReadAdapter } from "@/adapters/finance/reporting/ProductionFinanceReportingReadAdapter";
import { mapProductionDocsToFr7Bundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import type { FinanceReportingSourceBundle } from "@/domain/finance/reporting/FinanceReportingTypes";

export const CUTOVER_CENSUS_PAGE_SIZE = FINANCE_REPORTING_RO_QUERY_LIMIT;
/** Hard safety budget — raise only with ops approval. */
export const CUTOVER_CENSUS_MAX_PAGES_PER_COLLECTION = 200 as const;

export const CUTOVER_CENSUS_EXTRA_COLLECTIONS = [
  "order",
  "wallets",
  "transactions",
  "finance_audit_events",
  "finance_reconciliation_runs",
] as const;

export type CutoverCensusCollectionScan = {
  collection: string;
  pages: number;
  docs: number;
  scanComplete: boolean;
  truncatedByPageCap: boolean;
  nextCursor: string | null;
  ids: string[];
};

export type FinanceCutoverMalformedDoc = {
  collection: string;
  id: string;
  problems: string[];
  /** Sanitized field presence — never invents money. */
  moneyFieldsPresent: string[];
  linkedParty: string | null;
  linkedOrderId: string | null;
  linkedSettlementId: string | null;
  currency: string | null;
  rawKeys: string[];
};

export type FinanceCutoverCensusResult = {
  dryRun: true;
  productionWrites: 0;
  firestoreMutations: 0;
  productionReads: number;
  bundle: FinanceReportingSourceBundle;
  scans: CutoverCensusCollectionScan[];
  scannedByCollection: Record<string, number>;
  extraDocs: Record<string, FinanceReportingRoDoc[]>;
  /** FR7-mapped finance docs that failed shape validation — not silently discarded. */
  malformedDocs: FinanceCutoverMalformedDoc[];
  /** Raw FR7 collection docs (snapshots/settlements/payments/adjustments/…) for impact resolution. */
  fr7RawDocs: Record<string, FinanceReportingRoDoc[]>;
  scanComplete: boolean;
  blockers: string[];
};

function withId(doc: FinanceReportingRoDoc): Record<string, unknown> | null {
  if (!doc.exists || !doc.data) return null;
  return { ...doc.data, id: doc.id };
}

async function scanCollection(
  firestore: FinanceReportingRoFirestorePort,
  collection: string,
  maxPages: number,
): Promise<{ scan: CutoverCensusCollectionScan; docs: FinanceReportingRoDoc[] }> {
  const docsAccum: FinanceReportingRoDoc[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let truncatedByPageCap = false;
  let scanComplete = false;
  const ids: string[] = [];

  while (pages < maxPages) {
    const page = await firestore.queryPage!(collection, {
      limit: CUTOVER_CENSUS_PAGE_SIZE,
      cursor,
      countryId: null,
    });
    pages += 1;
    for (const doc of page.docs) {
      if (!doc.exists) continue;
      ids.push(doc.id);
      docsAccum.push(doc);
    }
    if (!page.nextCursor || page.docs.length < CUTOVER_CENSUS_PAGE_SIZE) {
      scanComplete = true;
      cursor = null;
      break;
    }
    cursor = page.nextCursor;
  }
  if (!scanComplete) truncatedByPageCap = true;

  return {
    scan: {
      collection,
      pages,
      docs: ids.length,
      scanComplete,
      truncatedByPageCap,
      nextCursor: cursor,
      ids,
    },
    docs: docsAccum,
  };
}

/**
 * Load full (or maxPages-bounded) FR7 finance bundle via cursor pagination.
 */
export async function loadFinanceCutoverCensus(input: {
  firestore: FinanceReportingRoFirestorePort;
  maxPagesPerCollection?: number;
  includeExtraCollections?: boolean;
}): Promise<FinanceCutoverCensusResult> {
  const maxPages =
    input.maxPagesPerCollection ?? CUTOVER_CENSUS_MAX_PAGES_PER_COLLECTION;
  const blockers: string[] = [];
  const scans: CutoverCensusCollectionScan[] = [];
  const scannedByCollection: Record<string, number> = {};
  const extraDocs: Record<string, FinanceReportingRoDoc[]> = {};

  if (typeof input.firestore.queryPage !== "function") {
    const adapter = new ProductionFinanceReportingReadAdapter(input.firestore);
    const loaded = await adapter.load();
      blockers.push("queryPage_unavailable_fell_back_to_50_doc_window");
    return {
      dryRun: true,
      productionWrites: 0,
      firestoreMutations: 0,
      productionReads: loaded.productionReads,
      bundle: loaded.bundle,
      scans: FINANCE_REPORTING_RO_COLLECTIONS.map((c) => ({
        collection: c,
        pages: 1,
        docs:
          c === "finance_accounting_snapshots"
            ? loaded.bundle.snapshots.length
            : c === "financial_settlements"
              ? loaded.bundle.settlements.length
              : c === "financial_settlement_payments"
                ? loaded.bundle.payments.length
                : c === "finance_adjustments"
                  ? loaded.bundle.adjustments.length
                  : 0,
        scanComplete: false,
        truncatedByPageCap: true,
        nextCursor: null,
        ids: [],
      })),
      scannedByCollection: {},
      extraDocs: {},
      malformedDocs: [],
      fr7RawDocs: {},
      scanComplete: false,
      blockers,
    };
  }

  const fr7Pages: FinanceReportingRoDoc[][] = [];
  for (const collection of FINANCE_REPORTING_RO_COLLECTIONS) {
    const { scan, docs } = await scanCollection(
      input.firestore,
      collection,
      maxPages,
    );
    if (!scan.scanComplete) {
      blockers.push(`truncated:${collection}:maxPages_${maxPages}`);
    }
    scans.push(scan);
    scannedByCollection[collection] = scan.docs;
    fr7Pages.push(docs);
  }

  if (input.includeExtraCollections !== false) {
    for (const collection of CUTOVER_CENSUS_EXTRA_COLLECTIONS) {
      try {
        const { scan, docs } = await scanCollection(
          input.firestore,
          collection,
          maxPages,
        );
        if (!scan.scanComplete) {
          blockers.push(`truncated:${collection}:maxPages_${maxPages}`);
        }
        scans.push(scan);
        scannedByCollection[collection] = scan.docs;
        extraDocs[collection] = docs;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        blockers.push(
          `extra_collection_unavailable:${collection}:${msg.slice(0, 120)}`,
        );
        scans.push({
          collection,
          pages: 0,
          docs: 0,
          scanComplete: false,
          truncatedByPageCap: false,
          nextCursor: null,
          ids: [],
        });
        scannedByCollection[collection] = 0;
        extraDocs[collection] = [];
      }
    }
  }

  const bundle = mapProductionDocsToFr7Bundle({
    snapshot: null,
    settlement: null,
    payment: null,
    adjustment: null,
    synthetic: false,
    activeAgentByCountry: {},
  });
  const slots = [
    "snapshot",
    "settlement",
    "payment",
    "adjustment",
    "refunds",
    "chargebacks",
    "payouts",
  ] as const;
  const collectionBySlot = [
    "finance_accounting_snapshots",
    "financial_settlements",
    "financial_settlement_payments",
    "finance_adjustments",
    "finance_refund_accounting",
    "finance_chargeback_accounting",
    "finance_payout_preparations",
  ] as const;
  const malformedDocs: FinanceCutoverMalformedDoc[] = [];
  const fr7RawDocs: Record<string, FinanceReportingRoDoc[]> = {};
  fr7Pages.forEach((page, index) => {
    const collection = collectionBySlot[index]!;
    fr7RawDocs[collection] = page;
    for (const doc of page) {
      const data = withId(doc);
      if (!data) continue;
      // Finance clean-reset archive tombstones — never enter FR7 / opening / KPIs.
      if (
        data.financeCleanResetArchived === true ||
        data.exclude_from_real_reporting === true
      ) {
        continue;
      }
      const slot = slots[index]!;
      const problems: string[] = [];
      if (!data.id) problems.push("missing_id");
      if (typeof data.currency !== "string" || !/^[A-Za-z]{3}$/.test(data.currency)) {
        problems.push("currency_invalid_or_missing");
      }
      if (
        slot !== "payment" &&
        !tryCanonicalCountryId(String(data.countryId ?? ""))
      ) {
        problems.push("countryId_not_canonical");
      }
      if (
        slot === "settlement" &&
        (!data.partyId ||
          !["agent", "driver"].includes(String(data.partyType)))
      ) {
        problems.push("settlement_party_invalid");
      }
      if (slot === "payment" && !data.settlementId) {
        problems.push("payment_missing_settlementId");
      }
      if (slot === "snapshot" && !data.orderId) {
        problems.push("snapshot_missing_orderId");
      }
      if (problems.length > 0) {
        const moneyFieldsPresent = [
          "amountMinor",
          "paidConfirmedMinor",
          "grossFareMinor",
          "amount",
          "total",
          "total_mndob",
        ].filter((k) => data[k] != null && data[k] !== "");
        malformedDocs.push({
          collection,
          id: String(data.id ?? doc.id),
          problems,
          moneyFieldsPresent,
          linkedParty:
            typeof data.partyId === "string"
              ? `${String(data.partyType ?? "?")}:${data.partyId}`
              : typeof data.driverId === "string"
                ? `driver:${data.driverId}`
                : null,
          linkedOrderId:
            typeof data.orderId === "string"
              ? data.orderId
              : typeof data.sourceOrderId === "string"
                ? data.sourceOrderId
                : null,
          linkedSettlementId:
            typeof data.settlementId === "string"
              ? data.settlementId
              : typeof data.sourceAccountingSnapshotId === "string"
                ? `snapshot:${data.sourceAccountingSnapshotId}`
                : null,
          currency:
            typeof data.currency === "string" ? data.currency : null,
          rawKeys: Object.keys(data).slice(0, 40),
        });
        continue;
      }
      const mapped = mapProductionDocsToFr7Bundle({
        snapshot: null,
        settlement: null,
        payment: null,
        adjustment: null,
        synthetic: false,
        activeAgentByCountry: {},
        [slot]: index >= 4 ? [data] : data,
      });
      bundle.snapshots.push(...mapped.snapshots);
      bundle.settlements.push(...mapped.settlements);
      bundle.payments.push(...mapped.payments);
      bundle.adjustments.push(...mapped.adjustments);
      bundle.refunds.push(...mapped.refunds);
      bundle.chargebacks.push(...mapped.chargebacks);
      bundle.payouts.push(...mapped.payouts);
    }
  });

  if (malformedDocs.length) {
    blockers.push(
      `malformed_financial_records_excluded:${malformedDocs.length}`,
    );
  }

  const scanComplete = scans.every((s) => s.scanComplete);
  if (!scanComplete) {
    blockers.push("census_incomplete_page_cap_or_extra_collection_errors");
  }

  const counter = input.firestore.getCounter();
  return {
    dryRun: true,
    productionWrites: 0,
    firestoreMutations: 0,
    productionReads: counter.productionReads,
    bundle,
    scans,
    scannedByCollection,
    extraDocs,
    malformedDocs,
    fr7RawDocs,
    scanComplete,
    blockers,
  };
}
