import type { FinanceSummaryPlaceholder } from "@/types/finance";
import type { FinanceRepository } from "@/repositories/interfaces/FinanceRepository";
import { seedTrips } from "@/test/fixtures/seed";

export class InMemoryFinanceRepository implements FinanceRepository {
  async getDashboardFinancePlaceholder(): Promise<FinanceSummaryPlaceholder> {
    const cash = seedTrips.reduce((sum, trip) => sum + (trip.cashCollected ?? 0), 0);
    const online = seedTrips.reduce((sum, trip) => sum + (trip.onlineCollected ?? 0), 0);
    return {
      cashCollected: cash,
      onlineCollected: online,
      // Phase 1: no formulas — leave commission/VAT unavailable
      platformCommission: null,
      agentCommission: null,
      vatAmount: null,
      confidence: "incomplete",
      unavailableReasons: [
        "FinancialPolicyProvider not approved",
        "VAT base rules pending",
        "Settlement formulas deferred to later phase",
      ],
    };
  }
}
