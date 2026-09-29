/**
 * QA / test / demo deletion manifest — DRY RUN ONLY.
 * Never deletes. REAL records must remain count 0.
 */

import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import type { FinanceCutoverInventoryRow } from "@/domain/finance/cutover/FinanceCutoverClassification";
import type { FinanceReportingRoDoc } from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { FINANCE_FR2_SETTLEMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR5_PAYMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr5PilotConstants";
import { FINANCE_FR6_ADJUSTMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr6PilotConstants";

const PROVENANCE_PROVEN_IDS = [
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR5_PAYMENT_DOC_ID,
  FINANCE_FR6_ADJUSTMENT_DOC_ID,
] as const;

export type QaDeleteManifestEntry = {
  collection: string;
  id: string;
  provenance: string[];
  linkedChildren: string[];
  sharedReferences: boolean;
  proposedDeletionOrder: number;
  safeToDeleteWhenApproved: boolean;
};

export type QaDeleteManifest = {
  dryRun: true;
  deletions: 0;
  entries: QaDeleteManifestEntry[];
  realRecordsToDelete: 0;
  heuristicOnlyExcluded: string[];
};

const PROVENANCE_MAP: Record<string, { collection: string; proof: string }> = {
  [FINANCE_FR1_SYNTHETIC_ORDER_ID]: {
    collection: "finance_accounting_snapshots",
    proof: "FinanceFr1SyntheticFixtureConstants + registry admin_next_finance_fr1_order_fixtures",
  },
  [FINANCE_FR2_SETTLEMENT_DOC_ID]: {
    collection: "financial_settlements",
    proof: "FinanceFr2PilotConstants FINANCE_FR2_SETTLEMENT_DOC_ID",
  },
  [FINANCE_FR5_PAYMENT_DOC_ID]: {
    collection: "financial_settlement_payments",
    proof: "FinanceFr5PilotConstants FINANCE_FR5_PAYMENT_DOC_ID",
  },
  [FINANCE_FR6_ADJUSTMENT_DOC_ID]: {
    collection: "finance_adjustments",
    proof: "FinanceFr6PilotConstants FINANCE_FR6_ADJUSTMENT_DOC_ID",
  },
};

export function buildQaDeleteManifest(input: {
  rows: readonly FinanceCutoverInventoryRow[];
  extraDocs?: Record<string, FinanceReportingRoDoc[]>;
}): QaDeleteManifest {
  const proven = new Set<string>(PROVENANCE_PROVEN_IDS);
  const heuristicOnlyExcluded: string[] = [];
  const byId = new Map<string, QaDeleteManifestEntry>();

  for (const row of input.rows) {
    if (row.class !== "QA_TEST" && row.class !== "DEMO_PILOT") continue;
    if (!row.provenanceProvenSynthetic && !proven.has(row.id)) {
      if (isFinanceQaOrPilotRecordId(row.id)) {
        heuristicOnlyExcluded.push(row.id);
      }
      continue;
    }
    const meta = PROVENANCE_MAP[row.id];
    byId.set(row.id, {
      collection:
        meta?.collection ??
        (row.kind === "legacy_fin_set" ? "financial_settlements" : row.kind),
      id: row.id,
      provenance: [
        ...(meta ? [meta.proof] : []),
        ...row.reasons,
        "provenanceProvenSynthetic=true",
      ],
      linkedChildren: row.sourceReferences,
      sharedReferences: false,
      proposedDeletionOrder: 0,
      safeToDeleteWhenApproved: true,
    });
  }

  // Extra order fixture registry / order doc
  for (const [collection, docs] of Object.entries(input.extraDocs ?? {})) {
    for (const doc of docs) {
      if (!proven.has(doc.id) && !isFinanceQaOrPilotRecordId(doc.id)) continue;
      if (!proven.has(doc.id)) {
        heuristicOnlyExcluded.push(doc.id);
        continue;
      }
      if (byId.has(doc.id)) continue;
      const meta = PROVENANCE_MAP[doc.id];
      byId.set(doc.id, {
        collection: meta?.collection ?? collection,
        id: doc.id,
        provenance: [
          meta?.proof ?? "PROVENANCE_PROVEN_SYNTHETIC_IDS",
          `extra_scan:${collection}`,
        ],
        linkedChildren: [],
        sharedReferences: false,
        proposedDeletionOrder: 0,
        safeToDeleteWhenApproved: true,
      });
    }
  }

  // Deletion order: payments → adjustments → settlements → snapshots/orders
  const orderRank = (collection: string): number => {
    if (collection.includes("payment")) return 1;
    if (collection.includes("adjustment")) return 2;
    if (collection.includes("settlement")) return 3;
    if (collection.includes("snapshot")) return 4;
    if (collection === "order") return 5;
    return 9;
  };

  const entries = [...byId.values()].sort(
    (a, b) => orderRank(a.collection) - orderRank(b.collection),
  );
  entries.forEach((e, i) => {
    e.proposedDeletionOrder = i + 1;
  });

  return {
    dryRun: true,
    deletions: 0,
    entries,
    realRecordsToDelete: 0,
    heuristicOnlyExcluded: [...new Set(heuristicOnlyExcluded)],
  };
}
