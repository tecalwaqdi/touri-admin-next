/**
 * Production FR7 reporting source adapter.
 * UI → API → FinanceReportingReadService → this port → Firestore RO.
 * No reporting table; no writes; missing fields stay null.
 */

import { mapProductionDocsToFr7Bundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import {
  FINANCE_REPORTING_RO_QUERY_LIMIT,
  type FinanceReportingSourceLoadQuery,
  type FinanceReportingSourceLoadResult,
  type FinanceReportingSourcePort,
  type FinanceReportingRoFirestorePort,
} from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import {
  FINANCE_FR7_PRODUCTION_CHAIN_DOC_IDS,
  createFirebaseFinanceReportingRoFirestorePort,
} from "@/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";

function withId(doc: {
  id: string;
  exists: boolean;
  data: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  if (!doc.exists || !doc.data) return null;
  return { ...doc.data, id: doc.id };
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

    const chain = FINANCE_FR7_PRODUCTION_CHAIN_DOC_IDS;
    const [snapDoc, settDoc, payDoc, adjDoc] = await Promise.all([
      this.firestore.getDocument(chain.snapshot.collection, chain.snapshot.id),
      this.firestore.getDocument(
        chain.settlement.collection,
        chain.settlement.id,
      ),
      this.firestore.getDocument(chain.payment.collection, chain.payment.id),
      this.firestore.getDocument(
        chain.adjustment.collection,
        chain.adjustment.id,
      ),
    ]);

    // Bounded collection reads (no full scans). Country filter when scoped.
    const [refundRows, cbRows, payoutRows] = await Promise.all([
      this.firestore.queryByCountry("finance_refund_accounting", {
        countryId,
        limit,
      }),
      this.firestore.queryByCountry("finance_chargeback_accounting", {
        countryId,
        limit,
      }),
      this.firestore.queryByCountry("finance_payout_preparations", {
        countryId,
        limit,
      }),
    ]);

    const bundle = mapProductionDocsToFr7Bundle({
      snapshot: withId(snapDoc),
      settlement: withId(settDoc),
      payment: withId(payDoc),
      adjustment: withId(adjDoc),
      synthetic: false,
      refunds: refundRows
        .map((d) => withId(d))
        .filter((d): d is Record<string, unknown> => d != null),
      chargebacks: cbRows
        .map((d) => withId(d))
        .filter((d): d is Record<string, unknown> => d != null),
      payouts: payoutRows
        .map((d) => withId(d))
        .filter((d): d is Record<string, unknown> => d != null),
    });

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
