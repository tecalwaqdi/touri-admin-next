/**
 * Historical Saudi finance recovery — dry-run only.
 * Inspect blocked Saudi trips (missing facts / inconsistent majors) against
 * authoritative historical sources. Never writes, never re-rates, never
 * changes payment status.
 */

import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { classifyFinanceFr1Trip } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { classifyLegacyTripRecord } from "@/domain/trip/TripRecordClassification";
import { detectMajorInconsistency } from "@/application/finance/materialize/AccountingSnapshotMaterializeService";
import {
  HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES,
  HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE,
  SAUDI_CANONICAL_COUNTRY_ID,
  type HistoricalSaudiOrderPage,
} from "@/application/finance/materialize/HistoricalSaudiTripsDryRun";

export type RecoveryConfidence =
  | "high"
  | "medium"
  | "low"
  | "conflict"
  | "missing";

export type RecoveredFieldValue = {
  amountMinor: string | null;
  majorHint: number | null;
  source: string;
  confidence: RecoveryConfidence;
  notes: string[];
};

export type TripFinanceReconciliation = {
  orderId: string;
  blockReason: "missing_financial_facts" | "inconsistent";
  paymentMethod: string | null;
  paymentStatus: string | null;
  currency: string | null;
  lifecycleCompleted: boolean;
  statusCode: string | null;
  gross: RecoveredFieldValue;
  commission: RecoveredFieldValue;
  vat: RecoveredFieldValue;
  driverNet: RecoveredFieldValue;
  missingFields: string[];
  inconsistencyReason: string | null;
  competingValues: Array<{
    field: string;
    values: Array<{ source: string; amountMinor: string; notes: string }>;
  }>;
  sourcesProbed: string[];
  orderMoneyKeysPresent: string[];
  recoverable: "yes_full" | "yes_partial" | "no";
  proposedSafeBackfill: Array<{
    field: "gross" | "commission" | "vat" | "driverNet";
    targetOrderField: string;
    amountMinor: string;
    majorHint: number | null;
    fromSource: string;
    confidence: RecoveryConfidence;
  }>;
};

export type HistoricalSaudiFinanceRecoveryResult = {
  dryRun: true;
  productionWrites: 0;
  orderMutations: 0;
  settlementWrites: 0;
  pagesScanned: number;
  ordersSeen: number;
  scanComplete: boolean;
  counts: {
    realSaudiTrips: number;
    unpaidOrIncomplete: number;
    missingFacts: number;
    inconsistent: number;
    recoverableFromAuthoritativeSources: number;
    notRecoverable: number;
    recoverableFully: number;
    recoverablePartially: number;
  };
  perFieldMissingCounts: {
    gross: number;
    commission: number;
    vat: number;
    driverNet: number;
    paymentStatus: number;
    currency: number;
  };
  proposedSafeBackfill: TripFinanceReconciliation["proposedSafeBackfill"];
  trips: TripFinanceReconciliation[];
  inconsistentDetail: TripFinanceReconciliation | null;
};

export type FinanceRecoveryScanPort = {
  listOrdersPage(input: {
    limit: number;
    cursor: string | null;
  }): Promise<HistoricalSaudiOrderPage>;
  getSnapshot(orderId: string): Promise<{
    exists: boolean;
    data: Record<string, unknown> | null;
  }>;
  /** Optional: query finance collections by equality (WIF finance_writer RO). */
  queryFinanceEqual?(
    collection: string,
    field: string,
    value: string,
    limit?: number,
  ): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  /** Optional: query RO collections (transactions/wallets). */
  queryRoEqual?(
    collection: string,
    field: string,
    value: string,
    limit?: number,
  ): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
};

const MONEY_KEY_RE =
  /^(total|total_|fare|price|amount|commission|vat|mndob|app|profit|delivery|ksm|fee|gross|net|repCommission|appProfit|deliveryFees|financial_snapshot)/i;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function majorToMinor(major: number): bigint {
  return BigInt(Math.round(major * 100));
}

function parseNumericMajor(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function parseMinorFlexible(v: unknown): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    // Heuristic: absolute values >= 1000 without decimals likely already minor;
    // order majors are typically small majors (e.g. 100 SAR). Prefer major→minor
    // for typical order-scale numbers (< 100000).
    if (Number.isInteger(v) && Math.abs(v) >= 1000 && Math.abs(v) % 100 === 0) {
      // Ambiguous — treat as minor only when clearly stamped as *Minor fields.
      return BigInt(Math.round(v));
    }
    return majorToMinor(v);
  }
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return parseMinorFlexible(Number(v));
  }
  return null;
}

function parseMinorStrict(v: unknown): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v) && Number.isInteger(v)) {
    return BigInt(v);
  }
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) {
    return BigInt(v.trim());
  }
  return null;
}

function majorHintFromMinor(v: bigint | null): number | null {
  if (v == null) return null;
  return Number(v) / 100;
}

type Candidate = {
  amountMinor: bigint;
  source: string;
  confidence: RecoveryConfidence;
  notes: string[];
};

function pickBest(candidates: Candidate[]): RecoveredFieldValue {
  if (candidates.length === 0) {
    return {
      amountMinor: null,
      majorHint: null,
      source: "none",
      confidence: "missing",
      notes: ["no_authoritative_value_found"],
    };
  }
  const byMinor = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const k = c.amountMinor.toString();
    const list = byMinor.get(k) ?? [];
    list.push(c);
    byMinor.set(k, list);
  }
  if (byMinor.size > 1) {
    const ranked = [...candidates].sort((a, b) => {
      const rank = (x: RecoveryConfidence) =>
        x === "high" ? 0 : x === "medium" ? 1 : x === "low" ? 2 : 3;
      return rank(a.confidence) - rank(b.confidence);
    });
    return {
      amountMinor: null,
      majorHint: null,
      source: "conflict",
      confidence: "conflict",
      notes: [
        "competing_authoritative_values",
        ...ranked.map(
          (c) =>
            `${c.source}=${c.amountMinor.toString()}(${c.confidence})`,
        ),
      ],
    };
  }
  const best = [...candidates].sort((a, b) => {
    const rank = (x: RecoveryConfidence) =>
      x === "high" ? 0 : x === "medium" ? 1 : x === "low" ? 2 : 3;
    return rank(a.confidence) - rank(b.confidence);
  })[0]!;
  return {
    amountMinor: best.amountMinor.toString(),
    majorHint: majorHintFromMinor(best.amountMinor),
    source: best.source,
    confidence: best.confidence,
    notes: best.notes,
  };
}

function pushMajorCandidate(
  out: Candidate[],
  raw: unknown,
  source: string,
  confidence: RecoveryConfidence,
  notes: string[],
  asMinor = false,
): void {
  const minor = asMinor ? parseMinorStrict(raw) : parseMinorFlexible(raw);
  if (minor == null) return;
  out.push({ amountMinor: minor, source, confidence, notes });
}

function collectFromOrderData(data: Record<string, unknown>): {
  gross: Candidate[];
  commission: Candidate[];
  vat: Candidate[];
  driverNet: Candidate[];
  moneyKeys: string[];
} {
  const gross: Candidate[] = [];
  const commission: Candidate[] = [];
  const vat: Candidate[] = [];
  const driverNet: Candidate[] = [];

  pushMajorCandidate(
    gross,
    data.total_mndob2,
    "order.total_mndob2",
    "high",
    ["canonical_persisted_gross"],
  );
  pushMajorCandidate(
    commission,
    data.total_app,
    "order.total_app",
    "high",
    ["canonical_persisted_commission"],
  );
  pushMajorCandidate(
    vat,
    data.total_vat,
    "order.total_vat",
    "high",
    ["canonical_persisted_vat"],
  );
  pushMajorCandidate(
    driverNet,
    data.total_mndob,
    "order.total_mndob",
    "high",
    ["canonical_persisted_driver_net"],
  );

  // Documented V1 FinancialEngine aliases (FC-03 naming traps — amounts proven).
  pushMajorCandidate(
    gross,
    data.deliveryFees,
    "order.deliveryFees",
    "high",
    ["v1_alias_deliveryFees_equals_gross"],
  );
  pushMajorCandidate(
    commission,
    data.appProfit,
    "order.appProfit",
    "high",
    ["v1_alias_appProfit_equals_platform_commission"],
  );
  pushMajorCandidate(
    driverNet,
    data.repCommission,
    "order.repCommission",
    "high",
    ["v1_alias_repCommission_equals_driver_net"],
  );

  const snap = asRecord(data.financial_snapshot);
  if (Object.keys(snap).length) {
    pushMajorCandidate(
      gross,
      snap.total_mndob2 ?? snap.grossFare ?? snap.gross_fare ?? snap.baseFare,
      "order.financial_snapshot",
      "medium",
      ["nested_financial_snapshot_on_order"],
    );
    pushMajorCandidate(
      commission,
      snap.total_app ?? snap.platformCommission ?? snap.platform_fee,
      "order.financial_snapshot",
      "medium",
      ["nested_financial_snapshot_on_order"],
    );
    pushMajorCandidate(
      vat,
      snap.total_vat ?? snap.vatAmount ?? snap.vat,
      "order.financial_snapshot",
      "medium",
      ["nested_financial_snapshot_on_order"],
    );
    pushMajorCandidate(
      driverNet,
      snap.total_mndob ?? snap.driverNet ?? snap.driver_net,
      "order.financial_snapshot",
      "medium",
      ["nested_financial_snapshot_on_order"],
    );
    // Minor-unit stamps if present
    pushMajorCandidate(
      gross,
      snap.grossFareMinor ?? snap.total_mndob2_minor,
      "order.financial_snapshot.minor",
      "medium",
      ["nested_snapshot_minor_units"],
      true,
    );
    pushMajorCandidate(
      commission,
      snap.platformCommissionMinor ?? snap.total_app_minor,
      "order.financial_snapshot.minor",
      "medium",
      ["nested_snapshot_minor_units"],
      true,
    );
    pushMajorCandidate(
      vat,
      snap.vatAmountMinor ?? snap.total_vat_minor,
      "order.financial_snapshot.minor",
      "medium",
      ["nested_snapshot_minor_units"],
      true,
    );
    pushMajorCandidate(
      driverNet,
      snap.driverNetMinor ?? snap.total_mndob_minor,
      "order.financial_snapshot.minor",
      "medium",
      ["nested_snapshot_minor_units"],
      true,
    );
  }

  const moneyKeys = Object.keys(data).filter((k) => MONEY_KEY_RE.test(k));
  return { gross, commission, vat, driverNet, moneyKeys };
}

function collectFromAccountingSnapshot(
  data: Record<string, unknown> | null,
): {
  gross: Candidate[];
  commission: Candidate[];
  vat: Candidate[];
  driverNet: Candidate[];
} {
  const gross: Candidate[] = [];
  const commission: Candidate[] = [];
  const vat: Candidate[] = [];
  const driverNet: Candidate[] = [];
  if (!data) return { gross, commission, vat, driverNet };

  const push = (
    bag: Candidate[],
    raw: unknown,
    field: string,
    asMinor = true,
  ) => {
    pushMajorCandidate(
      bag,
      raw,
      `finance_accounting_snapshots.${field}`,
      "medium",
      ["certified_or_pilot_snapshot_doc"],
      asMinor,
    );
  };

  push(gross, data.grossFareMinor ?? data.gross_fare_minor ?? data.total_mndob2, "gross");
  push(
    commission,
    data.platformCommissionMinor ??
      data.commissionAmountPersistedMinor ??
      data.total_app,
    "commission",
  );
  push(vat, data.vatAmountMinor ?? data.vat_amount_minor ?? data.total_vat, "vat");
  push(
    driverNet,
    data.driverNetMinor ?? data.driver_net_minor ?? data.total_mndob,
    "driverNet",
  );

  return { gross, commission, vat, driverNet };
}

function collectFromSettlementDocs(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
): {
  gross: Candidate[];
  commission: Candidate[];
  vat: Candidate[];
  driverNet: Candidate[];
  notes: string[];
} {
  const gross: Candidate[] = [];
  const commission: Candidate[] = [];
  const vat: Candidate[] = [];
  const driverNet: Candidate[] = [];
  const notes: string[] = [];
  for (const doc of docs) {
    notes.push(`financial_settlements/${doc.id}`);
    const d = doc.data;
    // Settlement docs rarely hold full trip majors; capture only explicitly labeled fields.
    pushMajorCandidate(
      gross,
      d.grossFareMinor ?? d.gross_fare_minor ?? d.total_mndob2,
      `financial_settlements/${doc.id}`,
      "medium",
      ["settlement_explicit_gross"],
      typeof d.grossFareMinor === "number" ||
        typeof d.gross_fare_minor === "number",
    );
    pushMajorCandidate(
      commission,
      d.platformCommissionMinor ?? d.total_app,
      `financial_settlements/${doc.id}`,
      "medium",
      ["settlement_explicit_commission"],
      typeof d.platformCommissionMinor === "number",
    );
    pushMajorCandidate(
      vat,
      d.vatAmountMinor ?? d.total_vat,
      `financial_settlements/${doc.id}`,
      "medium",
      ["settlement_explicit_vat"],
      typeof d.vatAmountMinor === "number",
    );
    pushMajorCandidate(
      driverNet,
      d.driverNetMinor ?? d.total_mndob,
      `financial_settlements/${doc.id}`,
      "medium",
      ["settlement_explicit_driver_net"],
      typeof d.driverNetMinor === "number",
    );
  }
  return { gross, commission, vat, driverNet, notes };
}

function collectFromLedger(
  docs: Array<{ id: string; data: Record<string, unknown> }>,
): { notes: string[]; lowCandidates: Candidate[] } {
  const notes: string[] = [];
  const lowCandidates: Candidate[] = [];
  for (const doc of docs) {
    notes.push(`transactions/${doc.id}`);
    const amount = doc.data.amount ?? doc.data.amountMinor;
    const minor = parseMinorFlexible(amount);
    if (minor != null) {
      lowCandidates.push({
        amountMinor: minor,
        source: `transactions/${doc.id}`,
        confidence: "low",
        notes: [
          "ledger_line_not_canonical_major",
          `type=${String(doc.data.type ?? doc.data.transactionType ?? "")}`,
        ],
      });
    }
  }
  return { notes, lowCandidates };
}

function legacyCountryRaw(data: Record<string, unknown>): string | null {
  const fromId =
    (typeof data.country_id === "string" && data.country_id) ||
    (typeof data.countryId === "string" && data.countryId) ||
    null;
  if (fromId) return fromId.trim();
  const ref = data.Rev_dolh ?? data.countryRef ?? data.country;
  if (typeof ref === "string" && ref.trim()) return ref.trim();
  if (ref && typeof ref === "object") {
    const o = ref as { path?: unknown };
    if (typeof o.path === "string") return o.path;
  }
  return null;
}

export async function runHistoricalSaudiFinanceRecoveryDryRun(input: {
  port: FinanceRecoveryScanPort;
  maxPages?: number;
  pageSize?: number;
}): Promise<HistoricalSaudiFinanceRecoveryResult> {
  const maxPages = Math.min(
    Math.max(1, input.maxPages ?? HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES),
    HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES,
  );
  const pageSize = Math.min(
    Math.max(1, input.pageSize ?? HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE),
    HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE,
  );

  let pagesScanned = 0;
  let ordersSeen = 0;
  let cursor: string | null = null;
  let scanComplete = false;
  let realSaudiTrips = 0;
  let unpaidOrIncomplete = 0;
  const blocked: Array<{
    orderId: string;
    data: Record<string, unknown>;
    blockReason: "missing_financial_facts" | "inconsistent";
  }> = [];

  for (let page = 0; page < maxPages; page += 1) {
    const batch = await input.port.listOrdersPage({ limit: pageSize, cursor });
    pagesScanned += 1;
    if (batch.docs.length === 0) {
      scanComplete = true;
      cursor = null;
      break;
    }
    for (const doc of batch.docs) {
      ordersSeen += 1;
      const financeQa = isFinanceQaOrPilotRecordId(doc.id);
      const legacyRef = legacyCountryRaw(doc.data);
      const docIdFromRef = extractLegacyDocRefId(legacyRef) ?? legacyRef;
      const canonical = tryCanonicalCountryId(docIdFromRef ?? legacyRef);
      const tripClass = classifyLegacyTripRecord({
        documentId: doc.id,
        data: doc.data,
        countryDocId: docIdFromRef,
      });
      const fr1Class = classifyFinanceFr1Trip({
        documentId: doc.id,
        data: doc.data,
      });
      if (
        financeQa ||
        tripClass.classification === "test_or_noncanonical" ||
        fr1Class === "synthetic_test"
      ) {
        continue;
      }
      if (canonical !== SAUDI_CANONICAL_COUNTRY_ID) continue;
      realSaudiTrips += 1;

      const calculated = calculateFinanceFr1PilotSnapshot({
        order: { documentId: doc.id, data: doc.data },
        actorUserId: "historical_saudi_finance_recovery_dry_run",
      });
      const majorsInconsistent = detectMajorInconsistency(calculated);
      if (majorsInconsistent.length) {
        blocked.push({
          orderId: doc.id,
          data: doc.data,
          blockReason: "inconsistent",
        });
        continue;
      }
      if (calculated.reconciliationStatus !== "preconditions_blocked") {
        continue;
      }
      const blockers = calculated.reconciliationBlockers;
      const missingMajors = blockers.some((b) =>
        /gross_fare|driver_net|platform_commission|vat_|currency_missing/.test(
          b,
        ),
      );
      const unpaid = blockers.some((b) =>
        /payment_not_complete|snapshot_payment|snapshot_trip_not|payment_channel/.test(
          b,
        ),
      );
      if (missingMajors) {
        blocked.push({
          orderId: doc.id,
          data: doc.data,
          blockReason: "missing_financial_facts",
        });
      } else if (unpaid) {
        unpaidOrIncomplete += 1;
      } else {
        unpaidOrIncomplete += 1;
      }
    }
    cursor = batch.nextCursor;
    if (!cursor) {
      scanComplete = true;
      break;
    }
  }

  const trips: TripFinanceReconciliation[] = [];
  const allProposed: TripFinanceReconciliation["proposedSafeBackfill"] = [];

  for (const item of blocked) {
    const sourcesProbed = ["order"];
    const fromOrder = collectFromOrderData(item.data);

    let snapData: Record<string, unknown> | null = null;
    try {
      const snap = await input.port.getSnapshot(item.orderId);
      sourcesProbed.push("finance_accounting_snapshots");
      if (snap.exists) snapData = snap.data;
    } catch {
      sourcesProbed.push("finance_accounting_snapshots:error");
    }
    const fromSnap = collectFromAccountingSnapshot(snapData);

    let settlementDocs: Array<{ id: string; data: Record<string, unknown> }> =
      [];
    if (input.port.queryFinanceEqual) {
      try {
        settlementDocs = await input.port.queryFinanceEqual(
          "financial_settlements",
          "orderId",
          item.orderId,
          10,
        );
        if (settlementDocs.length === 0) {
          settlementDocs = await input.port.queryFinanceEqual(
            "financial_settlements",
            "order_id",
            item.orderId,
            10,
          );
        }
        sourcesProbed.push("financial_settlements");
      } catch {
        sourcesProbed.push("financial_settlements:error");
      }
    } else {
      sourcesProbed.push("financial_settlements:skipped");
    }
    const fromSettle = collectFromSettlementDocs(settlementDocs);

    let ledgerDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
    if (input.port.queryRoEqual) {
      for (const field of ["orderId", "order_id", "tripId", "trip_id"] as const) {
        try {
          const found = await input.port.queryRoEqual(
            "transactions",
            field,
            item.orderId,
            10,
          );
          sourcesProbed.push(`transactions:${field}`);
          if (found.length) {
            ledgerDocs = found;
            break;
          }
        } catch {
          sourcesProbed.push(`transactions:${field}:error`);
        }
      }
    } else {
      sourcesProbed.push("transactions:skipped");
    }
    const fromLedger = collectFromLedger(ledgerDocs);
    // Ledger amounts are inspected but NOT merged into major candidates
    // (not proven as trip major SoT). Record presence only.
    void fromLedger.lowCandidates;

    const gross = pickBest([
      ...fromOrder.gross,
      ...fromSnap.gross,
      ...fromSettle.gross,
    ]);
    const commission = pickBest([
      ...fromOrder.commission,
      ...fromSnap.commission,
      ...fromSettle.commission,
    ]);
    const vat = pickBest([
      ...fromOrder.vat,
      ...fromSnap.vat,
      ...fromSettle.vat,
    ]);
    const driverNet = pickBest([
      ...fromOrder.driverNet,
      ...fromSnap.driverNet,
      ...fromSettle.driverNet,
    ]);

    const calculated = calculateFinanceFr1PilotSnapshot({
      order: { documentId: item.orderId, data: item.data },
      actorUserId: "historical_saudi_finance_recovery_dry_run",
    });

    const competingValues: TripFinanceReconciliation["competingValues"] = [];
    const collectCompete = (
      field: string,
      bags: Candidate[],
    ) => {
      if (bags.length < 2) return;
      const uniq = new Map<string, Candidate>();
      for (const c of bags) {
        const k = `${c.source}:${c.amountMinor.toString()}`;
        uniq.set(k, c);
      }
      const values = [...uniq.values()];
      const minors = new Set(values.map((v) => v.amountMinor.toString()));
      if (minors.size > 1) {
        competingValues.push({
          field,
          values: values.map((v) => ({
            source: v.source,
            amountMinor: v.amountMinor.toString(),
            notes: v.notes.join(";"),
          })),
        });
      }
    };
    collectCompete("gross", [
      ...fromOrder.gross,
      ...fromSnap.gross,
      ...fromSettle.gross,
    ]);
    collectCompete("commission", [
      ...fromOrder.commission,
      ...fromSnap.commission,
      ...fromSettle.commission,
    ]);
    collectCompete("vat", [
      ...fromOrder.vat,
      ...fromSnap.vat,
      ...fromSettle.vat,
    ]);
    collectCompete("driverNet", [
      ...fromOrder.driverNet,
      ...fromSnap.driverNet,
      ...fromSettle.driverNet,
    ]);

    let inconsistencyReason: string | null = null;
    if (item.blockReason === "inconsistent") {
      const issues = detectMajorInconsistency(calculated);
      inconsistencyReason = issues[0] ?? "majors_inconsistent";
      // Always surface the four persisted majors as competing arithmetic evidence.
      competingValues.push({
        field: "arithmetic_identity",
        values: [
          {
            source: "order.total_mndob2",
            amountMinor: calculated.grossFareMinor ?? "null",
            notes: "gross",
          },
          {
            source: "order.total_app",
            amountMinor: calculated.commissionAmountPersistedMinor ?? "null",
            notes: "commission",
          },
          {
            source: "order.total_vat",
            amountMinor: calculated.vatAmountMinor ?? "null",
            notes: "vat",
          },
          {
            source: "order.total_mndob",
            amountMinor: calculated.driverNetMinor ?? "null",
            notes: "driverNet_persisted",
          },
          {
            source: "computed:gross-commission-vat",
            amountMinor: (() => {
              const g = calculated.grossFareMinor
                ? BigInt(calculated.grossFareMinor)
                : null;
              const c = calculated.commissionAmountPersistedMinor
                ? BigInt(calculated.commissionAmountPersistedMinor)
                : null;
              const v = calculated.vatAmountMinor
                ? BigInt(calculated.vatAmountMinor)
                : null;
              if (g == null || c == null || v == null) return "null";
              return (g - c - v).toString();
            })(),
            notes: "expected_driverNet",
          },
        ],
      });
    }

    const missingFields: string[] = [];
    if (gross.confidence === "missing" || gross.confidence === "conflict")
      missingFields.push("gross");
    if (
      commission.confidence === "missing" ||
      commission.confidence === "conflict"
    )
      missingFields.push("commission");
    if (vat.confidence === "missing" || vat.confidence === "conflict")
      missingFields.push("vat");
    if (
      driverNet.confidence === "missing" ||
      driverNet.confidence === "conflict"
    )
      missingFields.push("driverNet");

    const proposedSafeBackfill: TripFinanceReconciliation["proposedSafeBackfill"] =
      [];
    const propose = (
      field: "gross" | "commission" | "vat" | "driverNet",
      target: string,
      value: RecoveredFieldValue,
      canonicalPresent: boolean,
    ) => {
      if (canonicalPresent) return;
      if (value.amountMinor == null) return;
      if (value.confidence !== "high" && value.confidence !== "medium") return;
      if (value.source.startsWith("order.") && value.source.includes(target))
        return;
      // Only propose when source is alias/snapshot/settlement filling a missing canonical.
      if (value.source === `order.${target}`) {
        return;
      }
      proposedSafeBackfill.push({
        field,
        targetOrderField: target,
        amountMinor: value.amountMinor,
        majorHint: value.majorHint,
        fromSource: value.source,
        confidence: value.confidence,
      });
    };

    const hasCanonical = (field: string) =>
      Object.prototype.hasOwnProperty.call(item.data, field) &&
      parseNumericMajor(item.data[field]) != null;

    propose("gross", "total_mndob2", gross, hasCanonical("total_mndob2"));
    propose(
      "commission",
      "total_app",
      commission,
      hasCanonical("total_app"),
    );
    propose("vat", "total_vat", vat, hasCanonical("total_vat"));
    propose(
      "driverNet",
      "total_mndob",
      driverNet,
      hasCanonical("total_mndob"),
    );

    // Inconsistent trips: never propose silent choice.
    if (item.blockReason === "inconsistent") {
      proposedSafeBackfill.length = 0;
    }

    const presentCount = [
      gross,
      commission,
      vat,
      driverNet,
    ].filter(
      (f) => f.confidence === "high" || f.confidence === "medium",
    ).length;

    let recoverable: TripFinanceReconciliation["recoverable"] = "no";
    if (item.blockReason === "inconsistent") {
      recoverable = "no";
    } else if (presentCount === 4 && competingValues.length === 0) {
      // Check arithmetic agreement among recovered values
      const g = gross.amountMinor ? BigInt(gross.amountMinor) : null;
      const c = commission.amountMinor ? BigInt(commission.amountMinor) : null;
      const v = vat.amountMinor ? BigInt(vat.amountMinor) : null;
      const n = driverNet.amountMinor ? BigInt(driverNet.amountMinor) : null;
      if (g != null && c != null && v != null && n != null && g - c - v === n) {
        recoverable = "yes_full";
      } else if (g != null && c != null && v != null && n != null) {
        recoverable = "yes_partial";
        inconsistencyReason =
          inconsistencyReason ??
          `recovered_majors_inconsistent:expected_driverNet=${(g - c - v).toString()}_got=${n.toString()}`;
      } else {
        recoverable = "yes_partial";
      }
    } else if (presentCount > 0) {
      recoverable = "yes_partial";
    }

    const row: TripFinanceReconciliation = {
      orderId: item.orderId,
      blockReason: item.blockReason,
      paymentMethod: calculated.paymentMethod,
      paymentStatus: calculated.paymentStatus,
      currency: calculated.currency || null,
      lifecycleCompleted: calculated.lifecycleCompleted,
      statusCode:
        typeof item.data.status_code === "string"
          ? item.data.status_code
          : null,
      gross,
      commission,
      vat,
      driverNet,
      missingFields,
      inconsistencyReason,
      competingValues,
      sourcesProbed: [
        ...sourcesProbed,
        ...fromSettle.notes,
        ...fromLedger.notes,
      ],
      orderMoneyKeysPresent: fromOrder.moneyKeys,
      recoverable,
      proposedSafeBackfill,
    };
    trips.push(row);
    allProposed.push(...proposedSafeBackfill);
  }

  const recoverableFully = trips.filter((t) => t.recoverable === "yes_full")
    .length;
  const recoverablePartially = trips.filter(
    (t) => t.recoverable === "yes_partial",
  ).length;
  const notRecoverable = trips.filter((t) => t.recoverable === "no").length;

  const perFieldMissingCounts = {
    gross: 0,
    commission: 0,
    vat: 0,
    driverNet: 0,
    paymentStatus: 0,
    currency: 0,
  };
  for (const t of trips) {
    if (t.gross.confidence === "missing" || t.gross.confidence === "conflict")
      perFieldMissingCounts.gross += 1;
    if (
      t.commission.confidence === "missing" ||
      t.commission.confidence === "conflict"
    )
      perFieldMissingCounts.commission += 1;
    if (t.vat.confidence === "missing" || t.vat.confidence === "conflict")
      perFieldMissingCounts.vat += 1;
    if (
      t.driverNet.confidence === "missing" ||
      t.driverNet.confidence === "conflict"
    )
      perFieldMissingCounts.driverNet += 1;
    if (!t.paymentStatus) perFieldMissingCounts.paymentStatus += 1;
    if (!t.currency) perFieldMissingCounts.currency += 1;
  }

  return {
    dryRun: true,
    productionWrites: 0,
    orderMutations: 0,
    settlementWrites: 0,
    pagesScanned,
    ordersSeen,
    scanComplete,
    counts: {
      realSaudiTrips,
      unpaidOrIncomplete,
      missingFacts: blocked.filter((b) => b.blockReason === "missing_financial_facts")
        .length,
      inconsistent: blocked.filter((b) => b.blockReason === "inconsistent")
        .length,
      recoverableFromAuthoritativeSources:
        recoverableFully + recoverablePartially,
      notRecoverable,
      recoverableFully,
      recoverablePartially,
    },
    perFieldMissingCounts,
    proposedSafeBackfill: allProposed,
    trips,
    inconsistentDetail:
      trips.find((t) => t.blockReason === "inconsistent") ?? null,
  };
}
