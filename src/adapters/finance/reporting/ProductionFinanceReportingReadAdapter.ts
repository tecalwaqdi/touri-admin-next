/**
 * Production FR7 reporting source adapter.
 * UI → API → FinanceReportingReadService → this port → Firestore RO.
 * No reporting table; no writes; missing fields stay null.
 */

import { mapProductionDocsToFr7Bundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import {
  FINANCE_REPORTING_RO_QUERY_LIMIT,
  FINANCE_REPORTING_RO_COLLECTIONS,
  type FinanceReportingSourceLoadQuery,
  type FinanceReportingRoDoc,
  type FinanceReportingSourceLoadResult,
  type FinanceReportingSourcePort,
  type FinanceReportingRoFirestorePort,
} from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import {
  createFirebaseFinanceReportingRoFirestorePort,
} from "@/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";

function withId(doc: {
  id: string;
  exists: boolean;
  data: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  if (!doc.exists || !doc.data) return null;
  return { ...doc.data, id: doc.id };
}

/** Prefer non-fixture docs inside the hard query cap so real SoT fills first. */
function preferNonFixtureDocs(docs: FinanceReportingRoDoc[]): FinanceReportingRoDoc[] {
  const real: FinanceReportingRoDoc[] = [];
  const fixture: FinanceReportingRoDoc[] = [];
  for (const doc of docs) {
    if (isFinanceQaOrPilotRecordId(doc.id)) fixture.push(doc);
    else real.push(doc);
  }
  return [...real, ...fixture];
}

export class ProductionFinanceReportingReadAdapter
  implements FinanceReportingSourcePort
{
  readonly mode = "production_read_only" as const;

  constructor(private readonly firestore: FinanceReportingRoFirestorePort) {}

  async load(
    query?: FinanceReportingSourceLoadQuery,
  ): Promise<FinanceReportingSourceLoadResult> {
    const limit = Math.min(
      query?.limit ?? FINANCE_REPORTING_RO_QUERY_LIMIT,
      FINANCE_REPORTING_RO_QUERY_LIMIT,
    );
    const countryId = query?.countryId
      ? tryCanonicalCountryId(query.countryId)
      : null;

    // All canonical collections are read in bounded windows; no hard-coded pilot IDs.
    let pages: FinanceReportingRoDoc[][];
    if (query?.settlementId) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(query.settlementId)) throw new Error("validation_failed:invalid settlement ID");
      if (!this.firestore.queryBySettlement) throw new Error("SOURCE_UNAVAILABLE:related settlement reader missing");
      const settlement = await this.firestore.getDocument("financial_settlements", query.settlementId);
      const [payments, adjustments] = settlement.exists ? await Promise.all([
        this.firestore.queryBySettlement("financial_settlement_payments", query.settlementId, limit),
        this.firestore.queryBySettlement("finance_adjustments", query.settlementId, limit),
      ]) : [[], []];
      pages = [[], [settlement], payments, adjustments, [], [], []];
    } else {
      pages = await Promise.all(FINANCE_REPORTING_RO_COLLECTIONS.map(collection =>
        this.firestore.queryByCountry(collection, { countryId: null, limit }),
      ));
      // Snapshots + settlements: surface non-fixture docs first within the cap.
      pages = pages.map((page, index) =>
        index <= 1 ? preferNonFixtureDocs(page).slice(0, limit) : page,
      );
    }
    const bundle = mapProductionDocsToFr7Bundle({ snapshot: null, settlement: null, payment: null, adjustment: null, synthetic: false, activeAgentByCountry: {} });
    const slots = ["snapshot", "settlement", "payment", "adjustment", "refunds", "chargebacks", "payouts"] as const;
    let malformed = 0;
    pages.forEach((page, index) => {
      for (const doc of page) {
        const data = withId(doc);
        if (!data) continue;
        const slot = slots[index]!;
        // Scope/identity/currency must be present. Missing amounts remain nullable.
        if (!data.id || typeof data.currency !== "string" || !/^[A-Za-z]{3}$/.test(data.currency) ||
          (slot !== "payment" && !tryCanonicalCountryId(String(data.countryId ?? ""))) ||
          (slot === "settlement" && (!data.partyId || !["agent", "driver"].includes(String(data.partyType)))) ||
          (slot === "payment" && !data.settlementId) ||
          (slot === "snapshot" && !data.orderId)) { malformed++; continue; }
        const mapped = mapProductionDocsToFr7Bundle({ snapshot: null, settlement: null, payment: null, adjustment: null, synthetic: false, activeAgentByCountry: {}, [slot]: index >= 4 ? [data] : data });
        bundle.snapshots.push(...mapped.snapshots); bundle.settlements.push(...mapped.settlements);
        bundle.payments.push(...mapped.payments); bundle.adjustments.push(...mapped.adjustments);
        bundle.refunds.push(...mapped.refunds); bundle.chargebacks.push(...mapped.chargebacks); bundle.payouts.push(...mapped.payouts);
      }
    });
    const warnings = [
      query?.settlementId ? "bounded_related_records" : "bounded_financial_window",
      ...(malformed ? ["malformed_financial_records_excluded"] : []),
      ...(bundle.snapshots.length === 0 ? ["no_accounting_snapshots_in_window"] : []),
    ];
    bundle.sourceWarnings = warnings;

    // Optional country filter on in-memory bundle (canonical IDs only).
    if (countryId) {
      bundle.snapshots = bundle.snapshots.filter(
        (s) => s.countryId === countryId,
      );
      bundle.settlements = bundle.settlements.filter(
        (s) => s.countryId === countryId,
      );
      bundle.adjustments = bundle.adjustments.filter(
        (a) => a.countryId === countryId,
      );
      bundle.refunds = bundle.refunds.filter((r) => r.countryId === countryId);
      bundle.chargebacks = bundle.chargebacks.filter(
        (c) => c.countryId === countryId,
      );
      bundle.payouts = bundle.payouts.filter((p) => p.countryId === countryId);
      bundle.activeAgentByCountry = Object.fromEntries(
        Object.entries(bundle.activeAgentByCountry).filter(
          ([k]) => k === countryId,
        ),
      );
    }

    const counter = this.firestore.getCounter();
    return {
      mode: "production_read_only",
      bundle,
      productionReads: counter.productionReads,
      productionWrites: 0,
      firestoreMutations: 0,
    };
  }
}

export async function createProductionFinanceReportingReadAdapter(input?: {
  projectId?: string;
  firestore?: FinanceReportingRoFirestorePort;
}): Promise<ProductionFinanceReportingReadAdapter> {
  const firestore =
    input?.firestore ??
    (await createFirebaseFinanceReportingRoFirestorePort({
      projectId: input?.projectId,
    }));
  return new ProductionFinanceReportingReadAdapter(firestore);
}
