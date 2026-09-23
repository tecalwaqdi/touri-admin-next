/**
 * Historical Saudi trips integration — Production dry-run only.
 * Paginated order scan; classify Saudi / QA / FR1 eligibility; never writes.
 */

import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { classifyFinanceFr1Trip } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { classifyLegacyTripRecord } from "@/domain/trip/TripRecordClassification";
import { detectMajorInconsistency } from "@/application/finance/materialize/AccountingSnapshotMaterializeService";

export const HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES = 20 as const;
export const HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE = 50 as const;
export const SAUDI_CANONICAL_COUNTRY_ID = "saudi_arabia" as const;

export type HistoricalSaudiOrderPage = {
  docs: Array<{ id: string; data: Record<string, unknown> }>;
  nextCursor: string | null;
};

export type HistoricalSaudiScanPort = {
  listOrdersPage(input: {
    limit: number;
    cursor: string | null;
  }): Promise<HistoricalSaudiOrderPage>;
  getSnapshotExists(orderId: string): Promise<boolean>;
};

export type HistoricalSaudiTripRow = {
  orderId: string;
  legacyCountryRef: string | null;
  canonicalCountryId: string | null;
  classification:
    | "real_saudi"
    | "qa_excluded"
    | "non_saudi"
    | "country_unmapped"
    | "duplicate_id";
  reasons: string[];
  paymentMethod: string | null;
  paymentStatus: string | null;
  currency: string | null;
  lifecycleCompleted: boolean;
  grossFareMinor: string | null;
  platformCommissionMinor: string | null;
  vatAmountMinor: string | null;
  driverNetMinor: string | null;
  fr1Status:
    | "eligible"
    | "unpaid_or_incomplete"
    | "missing_currency"
    | "missing_financial_facts"
    | "inconsistent"
    | "already_materialized"
    | "not_applicable";
  createdAtHint: string | null;
};

export type HistoricalSaudiDryRunResult = {
  dryRun: true;
  productionWrites: 0;
  orderMutations: 0;
  settlementWrites: 0;
  targetCountryId: typeof SAUDI_CANONICAL_COUNTRY_ID;
  pagesScanned: number;
  pageSize: number;
  maxPages: number;
  ordersSeen: number;
  scanComplete: boolean;
  truncatedByPageCap: boolean;
  nextCursor: string | null;
  legacyCountryReferences: Record<string, number>;
  counts: {
    realHistoricalSaudi: number;
    qaExcluded: number;
    nonSaudi: number;
    countryUnmapped: number;
    duplicates: number;
    financiallyEligible: number;
    unpaidOrIncomplete: number;
    missingCurrency: number;
    missingFinancialFacts: number;
    inconsistent: number;
    alreadyMaterialized: number;
  };
  realSaudi: HistoricalSaudiTripRow[];
  qaExcluded: HistoricalSaudiTripRow[];
  financiallyEligible: HistoricalSaudiTripRow[];
  unpaidOrIncomplete: HistoricalSaudiTripRow[];
  missingCurrency: HistoricalSaudiTripRow[];
  missingFinancialFacts: HistoricalSaudiTripRow[];
  inconsistent: HistoricalSaudiTripRow[];
  alreadyMaterialized: HistoricalSaudiTripRow[];
  proposedMigration: string[];
};

function legacyCountryRaw(data: Record<string, unknown>): string | null {
  const fromId =
    (typeof data.country_id === "string" && data.country_id) ||
    (typeof data.countryId === "string" && data.countryId) ||
    null;
  if (fromId) return fromId.trim();
  const ref = data.Rev_dolh ?? data.countryRef ?? data.country;
  if (typeof ref === "string" && ref.trim()) return ref.trim();
  if (ref && typeof ref === "object") {
    const o = ref as { path?: unknown; referenceValue?: unknown };
    if (typeof o.path === "string") return o.path;
    if (typeof o.referenceValue === "string") return o.referenceValue;
  }
  return null;
}

function createdAtHint(data: Record<string, unknown>): string | null {
  for (const k of ["data_order", "createdAt", "created_at", "createdAtUtc"]) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
      try {
        return (v as { toDate: () => Date }).toDate().toISOString();
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

export async function runHistoricalSaudiTripsDryRun(input: {
  port: HistoricalSaudiScanPort;
  maxPages?: number;
  pageSize?: number;
  startCursor?: string | null;
}): Promise<HistoricalSaudiDryRunResult> {
  const maxPages = Math.min(
    Math.max(1, input.maxPages ?? HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES),
    HISTORICAL_SAUDI_DRY_RUN_MAX_PAGES,
  );
  const pageSize = Math.min(
    Math.max(1, input.pageSize ?? HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE),
    HISTORICAL_SAUDI_DRY_RUN_PAGE_SIZE,
  );

  const seen = new Set<string>();
  const legacyCountryReferences: Record<string, number> = {};
  const realSaudi: HistoricalSaudiTripRow[] = [];
  const qaExcluded: HistoricalSaudiTripRow[] = [];
  const financiallyEligible: HistoricalSaudiTripRow[] = [];
  const unpaidOrIncomplete: HistoricalSaudiTripRow[] = [];
  const missingCurrency: HistoricalSaudiTripRow[] = [];
  const missingFinancialFacts: HistoricalSaudiTripRow[] = [];
  const inconsistent: HistoricalSaudiTripRow[] = [];
  const alreadyMaterialized: HistoricalSaudiTripRow[] = [];

  let pagesScanned = 0;
  let ordersSeen = 0;
  let cursor: string | null = input.startCursor ?? null;
  let nonSaudi = 0;
  let countryUnmapped = 0;
  let duplicates = 0;
  let truncatedByPageCap = false;
  let scanComplete = false;

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
      if (seen.has(doc.id)) {
        duplicates += 1;
        continue;
      }
      seen.add(doc.id);

      const legacyRef = legacyCountryRaw(doc.data);
      if (legacyRef) {
        legacyCountryReferences[legacyRef] =
          (legacyCountryReferences[legacyRef] ?? 0) + 1;
      }
      const docIdFromRef = extractLegacyDocRefId(legacyRef) ?? legacyRef;
      const canonical = tryCanonicalCountryId(docIdFromRef ?? legacyRef);

      const tripClass = classifyLegacyTripRecord({
        documentId: doc.id,
        data: doc.data,
        countryDocId: docIdFromRef,
      });
      const financeQa = isFinanceQaOrPilotRecordId(doc.id);
      const fr1Class = classifyFinanceFr1Trip({
        documentId: doc.id,
        data: doc.data,
      });

      if (financeQa || tripClass.classification === "test_or_noncanonical" || fr1Class === "synthetic_test") {
        qaExcluded.push({
          orderId: doc.id,
          legacyCountryRef: legacyRef,
          canonicalCountryId: canonical,
          classification: "qa_excluded",
          reasons: [
            ...(financeQa ? ["finance_qa_or_pilot_id"] : []),
            ...tripClass.reasons,
            ...(fr1Class === "synthetic_test" ? ["fr1_synthetic_test"] : []),
          ],
          paymentMethod: null,
          paymentStatus: null,
          currency: null,
          lifecycleCompleted: false,
          grossFareMinor: null,
          platformCommissionMinor: null,
          vatAmountMinor: null,
          driverNetMinor: null,
          fr1Status: "not_applicable",
          createdAtHint: createdAtHint(doc.data),
        });
        continue;
      }

      if (!canonical) {
        countryUnmapped += 1;
        continue;
      }
      if (canonical !== SAUDI_CANONICAL_COUNTRY_ID) {
        nonSaudi += 1;
        continue;
      }

      const calculated = calculateFinanceFr1PilotSnapshot({
        order: { documentId: doc.id, data: doc.data },
        actorUserId: "historical_saudi_dry_run",
      });
      const snapExists = await input.port.getSnapshotExists(doc.id);
      const majorsInconsistent = detectMajorInconsistency(calculated);

      let fr1Status: HistoricalSaudiTripRow["fr1Status"] = "eligible";
      const reasons: string[] = ["saudi_canonical_mapped", "real_candidate"];

      if (snapExists) {
        fr1Status = "already_materialized";
        reasons.push("snapshot_already_exists");
      } else if (majorsInconsistent.length) {
        fr1Status = "inconsistent";
        reasons.push(...majorsInconsistent);
      } else if (!calculated.currency?.trim()) {
        fr1Status = "missing_currency";
        reasons.push("currency_missing_on_order");
      } else if (calculated.reconciliationStatus === "preconditions_blocked") {
        const blockers = calculated.reconciliationBlockers;
        const unpaid = blockers.some((b) =>
          /payment_not_complete|snapshot_payment|snapshot_trip_not|payment_channel/.test(
            b,
          ),
        );
        const missingMajors = blockers.some((b) =>
          /gross_fare|driver_net|platform_commission|vat_|currency_missing/.test(
            b,
          ),
        );
        if (unpaid && !missingMajors) {
          fr1Status = "unpaid_or_incomplete";
        } else if (missingMajors) {
          fr1Status = "missing_financial_facts";
        } else {
          fr1Status = "unpaid_or_incomplete";
        }
        reasons.push(...blockers);
      } else {
        reasons.push("fr1_preconditions_ok", calculated.snapshotEligibilityTrigger);
      }

      const row: HistoricalSaudiTripRow = {
        orderId: doc.id,
        legacyCountryRef: legacyRef,
        canonicalCountryId: canonical,
        classification: "real_saudi",
        reasons,
        paymentMethod: calculated.paymentMethod,
        paymentStatus: calculated.paymentStatus,
        currency: calculated.currency || null,
        lifecycleCompleted: calculated.lifecycleCompleted,
        grossFareMinor: calculated.grossFareMinor,
        platformCommissionMinor: calculated.commissionAmountPersistedMinor,
        vatAmountMinor: calculated.vatAmountMinor,
        driverNetMinor: calculated.driverNetMinor,
        fr1Status,
        createdAtHint: createdAtHint(doc.data),
      };

      realSaudi.push(row);
      if (fr1Status === "eligible") financiallyEligible.push(row);
      else if (fr1Status === "unpaid_or_incomplete") unpaidOrIncomplete.push(row);
      else if (fr1Status === "missing_currency") missingCurrency.push(row);
      else if (fr1Status === "missing_financial_facts")
        missingFinancialFacts.push(row);
      else if (fr1Status === "inconsistent") inconsistent.push(row);
      else if (fr1Status === "already_materialized")
        alreadyMaterialized.push(row);
    }

    cursor = batch.nextCursor;
    if (!cursor) {
      scanComplete = true;
      break;
    }
    if (page === maxPages - 1 && cursor) {
      truncatedByPageCap = true;
    }
  }

  const proposedMigration: string[] = [
    "Normalize legacy country refs (full Firestore paths) → saudi_arabia via extractLegacyDocRefId + tryCanonicalCountryId (read-path only; no order rewrite).",
    "Exclude finance control fixtures (demo_fin_*, fin_rt_*, finN_ctrl_*) from commercial Trips/Finance SoT views.",
    "FR1 materialize ONLY financiallyEligible rows (max 5 first batch) — preserve orderId + persisted majors; never re-rate.",
    "Unpaid/incomplete/missing-currency trips remain visible on Trips with honest payment/financial state; no certified snapshot until eligible.",
    "No Settlement V2 in this phase.",
  ];

  return {
    dryRun: true,
    productionWrites: 0,
    orderMutations: 0,
    settlementWrites: 0,
    targetCountryId: SAUDI_CANONICAL_COUNTRY_ID,
    pagesScanned,
    pageSize,
    maxPages,
    ordersSeen,
    scanComplete,
    truncatedByPageCap,
    nextCursor: cursor,
    legacyCountryReferences,
    counts: {
      realHistoricalSaudi: realSaudi.length,
      qaExcluded: qaExcluded.length,
      nonSaudi,
      countryUnmapped,
      duplicates,
      financiallyEligible: financiallyEligible.length,
      unpaidOrIncomplete: unpaidOrIncomplete.length,
      missingCurrency: missingCurrency.length,
      missingFinancialFacts: missingFinancialFacts.length,
      inconsistent: inconsistent.length,
      alreadyMaterialized: alreadyMaterialized.length,
    },
    realSaudi: realSaudi.slice(0, 100),
    qaExcluded: qaExcluded.slice(0, 50),
    financiallyEligible: financiallyEligible.slice(0, 50),
    unpaidOrIncomplete: unpaidOrIncomplete.slice(0, 50),
    missingCurrency: missingCurrency.slice(0, 50),
    missingFinancialFacts: missingFinancialFacts.slice(0, 50),
    inconsistent: inconsistent.slice(0, 50),
    alreadyMaterialized: alreadyMaterialized.slice(0, 50),
    proposedMigration,
  };
}
