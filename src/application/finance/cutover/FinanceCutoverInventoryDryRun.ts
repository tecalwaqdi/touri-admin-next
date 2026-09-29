/**
 * Finance clean cutover — full inventory dry-run (NO WRITES).
 * Classifies pre-cutover finance records, proposes opening balances,
 * and lists provenance-proven synthetic delete candidates.
 */

import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { FINANCE_FR2_SETTLEMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR5_PAYMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr5PilotConstants";
import { FINANCE_FR6_ADJUSTMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr6PilotConstants";
import {
  classifyCutoverSettlement,
  classifyCutoverSnapshot,
  type FinanceCutoverInventoryRow,
  type FinanceCutoverRecordClass,
} from "@/domain/finance/cutover/FinanceCutoverClassification";
import {
  resolveFinanceCutoverDate,
  type FinanceCutoverConfig,
} from "@/domain/finance/cutover/FinanceCutoverConfig";
import {
  proposeOpeningBalances,
  type OpeningBalanceProposal,
  type UnresolvedHistoricalBalance,
} from "@/domain/finance/cutover/FinanceOpeningBalanceProposal";
import { buildSnapshotIndex } from "@/domain/finance/reporting/SettlementCommercialCutover";
import { computeReconciliationIndicators } from "@/domain/finance/reporting/FinanceReportingAggregator";
import type {
  FinanceReportingSourceBundle,
  ReportingPaymentSource,
  ReportingAdjustmentSource,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import { isPreCutover } from "@/domain/finance/cutover/FinanceCutoverConfig";

/** Explicit Admin Next synthetic fixture registry — provenance-proven. */
export const PROVENANCE_PROVEN_SYNTHETIC_IDS: readonly string[] = [
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR5_PAYMENT_DOC_ID,
  FINANCE_FR6_ADJUSTMENT_DOC_ID,
];

export type FinanceCutoverDryRunReport = {
  dryRun: true;
  productionWrites: 0;
  deletions: 0;
  cutover: FinanceCutoverConfig;
  scan: {
    boundedWindow: boolean;
    snapshotsLoaded: number;
    settlementsLoaded: number;
    paymentsLoaded: number;
    adjustmentsLoaded: number;
    note: string;
    scannedByCollection: Record<string, number>;
  };
  wiring: {
    openingBalanceSchema: boolean;
    openingBalancePersist: boolean;
    archiveUx: boolean;
    currentPeriodKpiSplit: boolean;
    auditIdempotencySchema: boolean;
  };
  counts: Record<FinanceCutoverRecordClass, number>;
  historicalRows: FinanceCutoverInventoryRow[];
  idsByClass: Record<FinanceCutoverRecordClass, string[]>;
  openingBalances: {
    proposals: OpeningBalanceProposal[];
    driverOpeningBalances: OpeningBalanceProposal[];
    agentOpeningBalances: OpeningBalanceProposal[];
    companyNetOpening: {
      totalReceivable: string;
      totalPayable: string;
      currencyMixed: boolean;
    };
    unresolved: UnresolvedHistoricalBalance[];
  };
  qa: {
    heuristicMatches: string[];
    provenanceProvenSafeToDelete: Array<{
      id: string;
      kind: string;
      linkedChildren: string[];
    }>;
    heuristicOnlyNotSafeToDelete: string[];
  };
  safety: {
    realRecordsProposedForDelete: 0;
    realRecordsToArchive: number;
    expectedEffectOnKpis: string[];
    blockers: string[];
    readyToApplyCutover: false;
  };
  archivePlan: string[];
  newPeriodPlan: string[];
};

function emptyCounts(): Record<FinanceCutoverRecordClass, number> {
  return {
    REAL_CERTIFIED: 0,
    REAL_UNPAID: 0,
    REAL_INCOMPLETE: 0,
    REAL_CONFLICT: 0,
    LEGACY_ORPHAN: 0,
    QA_TEST: 0,
    DEMO_PILOT: 0,
    UNCLASSIFIED: 0,
  };
}

function emptyIds(): Record<FinanceCutoverRecordClass, string[]> {
  return {
    REAL_CERTIFIED: [],
    REAL_UNPAID: [],
    REAL_INCOMPLETE: [],
    REAL_CONFLICT: [],
    LEGACY_ORPHAN: [],
    QA_TEST: [],
    DEMO_PILOT: [],
    UNCLASSIFIED: [],
  };
}

function classifyPayment(
  p: ReportingPaymentSource,
  cutoverDateUtc: string,
  proven: ReadonlySet<string>,
): FinanceCutoverInventoryRow {
  const qa = isFinanceQaOrPilotRecordId(p.id);
  return {
    kind: "payment",
    id: p.id,
    class: qa ? "QA_TEST" : "REAL_CERTIFIED",
    reasons: qa ? ["qa_or_pilot_id"] : ["payment_row"],
    countryId: null,
    currency: p.currency || null,
    partyType: null,
    partyId: null,
    eventUtc: p.createdAtUtc,
    preCutover: isPreCutover(p.createdAtUtc, cutoverDateUtc),
    amountMinor: p.amountMinor?.toString() ?? null,
    paidConfirmedMinor: null,
    outstandingMinor: null,
    direction: null,
    provenanceProvenSynthetic: proven.has(p.id),
    sourceReferences: [`settlement:${p.settlementId}`],
  };
}

function classifyAdjustment(
  a: ReportingAdjustmentSource,
  cutoverDateUtc: string,
  proven: ReadonlySet<string>,
): FinanceCutoverInventoryRow {
  const qa = isFinanceQaOrPilotRecordId(a.id);
  const incomplete = a.status !== "approved" && a.status !== "rejected";
  let recordClass: FinanceCutoverRecordClass = "REAL_CERTIFIED";
  if (qa) recordClass = "QA_TEST";
  else if (incomplete) recordClass = "REAL_INCOMPLETE";
  return {
    kind: "adjustment",
    id: a.id,
    class: recordClass,
    reasons: qa ? ["qa_or_pilot_id"] : [`adjustment_status:${a.status}`],
    countryId: a.countryId ?? null,
    currency: a.currency ?? null,
    partyType: null,
    partyId: null,
    eventUtc: a.createdAtUtc ?? null,
    preCutover: isPreCutover(a.createdAtUtc, cutoverDateUtc),
    amountMinor: a.amountMinor?.toString() ?? null,
    paidConfirmedMinor: null,
    outstandingMinor: null,
    direction: null,
    provenanceProvenSynthetic: proven.has(a.id),
    sourceReferences: a.relatedSettlementId
      ? [`settlement:${a.relatedSettlementId}`]
      : a.relatedOrderId
        ? [`order:${a.relatedOrderId}`]
        : [],
  };
}

/**
 * Pure dry-run inventory from an already-loaded FR7 source bundle.
 * productionWrites always 0 — callers must not write.
 */
export function runFinanceCutoverInventoryDryRun(input: {
  bundle: FinanceReportingSourceBundle;
  /** Business date YYYY-MM-DD or leave empty for env/default. */
  cutoverDate?: string | null;
  timezone?: string | null;
  approved?: boolean | string | null;
  /** When true, FR7 50-doc window — report incomplete census. */
  boundedWindow?: boolean;
  scannedByCollection?: Record<string, number>;
  censusScanComplete?: boolean;
  censusBlockers?: string[];
  extraDocs?: Record<
    string,
    Array<{ id: string; exists: boolean; data: Record<string, unknown> | null }>
  >;
}): FinanceCutoverDryRunReport {
  const cutover = resolveFinanceCutoverDate({
    cutoverDate: input.cutoverDate,
    timezone: input.timezone,
    approved: input.approved,
  });
  const cutInstant = cutover.cutoverUtcInstant;
  const proven = new Set(PROVENANCE_PROVEN_SYNTHETIC_IDS);
  const snapshotsById = buildSnapshotIndex(input.bundle.snapshots);
  const recon = computeReconciliationIndicators({
    snapshots: input.bundle.snapshots,
    settlements: input.bundle.settlements,
  });
  const conflictIds = new Set(
    recon.blockers
      .map((b) => {
        const m = b.match(/:([A-Za-z0-9_-]+)$/);
        return m?.[1] ?? null;
      })
      .filter(Boolean) as string[],
  );

  const rows: FinanceCutoverInventoryRow[] = [];

  for (const snap of input.bundle.snapshots) {
    rows.push(
      classifyCutoverSnapshot({
        snapshot: snap,
        cutoverDateUtc: cutInstant,
        conflictSnapshotIds: conflictIds,
        provenanceProvenIds: proven,
      }),
    );
  }
  for (const sett of input.bundle.settlements) {
    rows.push(
      classifyCutoverSettlement({
        settlement: sett,
        snapshotsById,
        cutoverDateUtc: cutInstant,
        conflictSettlementIds: conflictIds,
        provenanceProvenIds: proven,
      }),
    );
  }
  for (const pay of input.bundle.payments) {
    rows.push(classifyPayment(pay, cutInstant, proven));
  }
  for (const adj of input.bundle.adjustments) {
    rows.push(classifyAdjustment(adj, cutInstant, proven));
  }

  for (const [collection, docs] of Object.entries(input.extraDocs ?? {})) {
    for (const doc of docs) {
      if (!doc.exists) continue;
      const qa = isFinanceQaOrPilotRecordId(doc.id);
      const kind =
        collection === "order"
          ? ("order" as const)
          : collection === "transactions"
            ? ("wallet_transaction" as const)
            : collection === "finance_audit_events"
              ? ("finance_audit" as const)
              : collection === "finance_reconciliation_runs"
                ? ("reconciliation" as const)
                : ("order" as const);
      rows.push({
        kind,
        id: doc.id,
        class: qa && proven.has(doc.id) ? "QA_TEST" : "UNCLASSIFIED",
        reasons: qa
          ? proven.has(doc.id)
            ? ["qa_or_pilot_id", "extra_collection_scan"]
            : ["qa_heuristic_only_needs_provenance", `collection:${collection}`]
          : [`extra_collection_unclassified:${collection}`],
        countryId: null,
        currency: null,
        partyType: null,
        partyId: null,
        eventUtc: null,
        preCutover: true,
        amountMinor: null,
        paidConfirmedMinor: null,
        outstandingMinor: null,
        direction: null,
        provenanceProvenSynthetic: proven.has(doc.id),
        sourceReferences: [`collection:${collection}`],
      });
    }
  }

  const historicalRows = rows.filter((r) => r.preCutover);
  const counts = emptyCounts();
  const idsByClass = emptyIds();
  for (const r of historicalRows) {
    counts[r.class] += 1;
    idsByClass[r.class].push(r.id);
  }

  const opening = proposeOpeningBalances({
    rows: historicalRows,
    cutoverDateUtc: cutInstant,
  });

  const heuristicMatches = historicalRows
    .filter((r) => r.class === "QA_TEST" || r.class === "DEMO_PILOT")
    .map((r) => r.id);
  const provenanceProvenSafeToDelete = historicalRows
    .filter((r) => r.provenanceProvenSynthetic)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      linkedChildren: r.sourceReferences,
    }));
  const provenIdSet = new Set(provenanceProvenSafeToDelete.map((x) => x.id));
  const heuristicOnlyNotSafeToDelete = heuristicMatches.filter(
    (id) => !provenIdSet.has(id),
  );

  const realToArchive = historicalRows.filter(
    (r) =>
      r.class === "REAL_CERTIFIED" ||
      r.class === "REAL_UNPAID" ||
      r.class === "REAL_INCOMPLETE" ||
      r.class === "REAL_CONFLICT" ||
      r.class === "LEGACY_ORPHAN",
  ).length;

  const blockers: string[] = [...(input.censusBlockers ?? [])];
  if (!cutover.approved) {
    blockers.push("FINANCE_CUTOVER_APPROVED_not_set");
  }
  if (cutover.businessDate !== "2026-10-01") {
    blockers.push(
      `cutover_business_date_is_${cutover.businessDate}_expected_2026-10-01`,
    );
  }
  if (input.boundedWindow !== false && input.censusScanComplete !== true) {
    blockers.push(
      "bounded_fr7_window_max_50_per_collection_full_census_incomplete",
    );
  }
  if (input.censusScanComplete === false) {
    blockers.push("census_scan_incomplete");
  }
  if (counts.UNCLASSIFIED > 0) {
    blockers.push(`unclassified_records:${counts.UNCLASSIFIED}`);
  }
  if (opening.unresolved.length > 0) {
    blockers.push(
      `unresolved_historical_balances:${opening.unresolved.length}`,
    );
  }
  if (heuristicOnlyNotSafeToDelete.length > 0) {
    blockers.push(
      `qa_heuristic_matches_lack_provenance:${heuristicOnlyNotSafeToDelete.length}`,
    );
  }
  blockers.push("destructive_delete_requires_explicit_second_approval");
  blockers.push("opening_balance_persist_disabled_until_apply");

  const wiring = {
    openingBalanceSchema: true,
    openingBalancePersist: false,
    archiveUx: true,
    currentPeriodKpiSplit: true,
    auditIdempotencySchema: true,
  };

  return {
    dryRun: true,
    productionWrites: 0,
    deletions: 0,
    cutover,
    scan: {
      boundedWindow:
        input.censusScanComplete === true
          ? false
          : input.boundedWindow !== false,
      snapshotsLoaded: input.bundle.snapshots.length,
      settlementsLoaded: input.bundle.settlements.length,
      paymentsLoaded: input.bundle.payments.length,
      adjustmentsLoaded: input.bundle.adjustments.length,
      note:
        input.censusScanComplete === true
          ? "Paginated census reported scanComplete=true"
          : "Census incomplete or bounded window — treat counts as lower bound",
      scannedByCollection: input.scannedByCollection ?? {},
    },
    counts,
    historicalRows,
    idsByClass,
    openingBalances: opening,
    qa: {
      heuristicMatches,
      provenanceProvenSafeToDelete,
      heuristicOnlyNotSafeToDelete,
    },
    wiring,
    safety: {
      realRecordsProposedForDelete: 0,
      realRecordsToArchive: realToArchive,
      expectedEffectOnKpis: [
        "After apply: Finance Home KPIs use only post-cutover certified snapshots/settlements",
        "Opening balances appear as separate line items (not period activity)",
        "Pre-cutover certified totals move to الأرشيف المالي السابق only",
        "Legacy orphans remain archived/read-only and never enter certified KPIs",
        "UNCLASSIFIED must be resolved before any delete/close",
      ],
      blockers,
      readyToApplyCutover: false,
    },
    archivePlan: [
      "Tag all pre-cutover REAL_* and LEGACY_ORPHAN finance docs as archive/read-only",
      "Accountant nav: الأرشيف المالي السابق — search/filter/view/export only",
      "Block prepare/approve/execute/reconcile/modify on archived records",
      "Exclude archive from Finance Home KPIs, new settlements, cash, recon, outstanding",
    ],
    newPeriodPlan: [
      `Enforce from ${cutover.businessDate} ${cutover.cutoverTimezone} (${cutover.cutoverUtcInstant}): completed+final → majors → certified snapshot → Settlement V2 → payment → recon`,
      "Only new-period certified data enters official KPIs",
      "Surface الرصيد الافتتاحي / حركة الفترة / الرصيد الحالي on Finance Home",
      "Default Finance Home to NEW PERIOD ONLY",
    ],
  };
}
