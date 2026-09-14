/**
 * Synthetic / golden FR7 source adapter — tests and local only.
 * Production UI must not use this when mode=production_read_only.
 */

import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import type {
  FinanceReportingSourceLoadQuery,
  FinanceReportingSourceLoadResult,
  FinanceReportingSourcePort,
} from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import type { FinanceReportingSourceBundle } from "@/domain/finance/reporting/FinanceReportingTypes";

function filterBundleByCountry(
  bundle: FinanceReportingSourceBundle,
  countryId: string | null | undefined,
): FinanceReportingSourceBundle {
  const canonical = countryId ? tryCanonicalCountryId(countryId) : null;
  if (!canonical) return bundle;
  return {
    ...bundle,
    snapshots: bundle.snapshots.filter((s) => s.countryId === canonical),
    settlements: bundle.settlements.filter((s) => s.countryId === canonical),
    adjustments: bundle.adjustments.filter((a) => a.countryId === canonical),
    refunds: bundle.refunds.filter((r) => r.countryId === canonical),
    chargebacks: bundle.chargebacks.filter((c) => c.countryId === canonical),
    payouts: bundle.payouts.filter((p) => p.countryId === canonical),
    activeAgentByCountry: Object.fromEntries(
      Object.entries(bundle.activeAgentByCountry).filter(
        ([k]) => k === canonical,
      ),
    ),
  };
}

export class SyntheticFinanceReportingSourceAdapter
  implements FinanceReportingSourcePort
{
  readonly mode = "synthetic" as const;

  async load(
    query?: FinanceReportingSourceLoadQuery,
  ): Promise<FinanceReportingSourceLoadResult> {
    const bundle = filterBundleByCountry(
      buildFinanceFr7GoldenSourceBundle(),
      query?.countryId,
    );
    return {
      mode: "synthetic",
      bundle,
      productionReads: 0,
      productionWrites: 0,
      firestoreMutations: 0,
    };
  }
}
