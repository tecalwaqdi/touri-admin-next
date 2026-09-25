import { describe, expect, it } from "vitest";
import { projectCashCollectionRows } from "@/domain/finance/reporting/AccountantCashCollections";
import type { FinanceReportingSourceBundle } from "@/domain/finance/reporting/FinanceReportingTypes";

describe("accountant cash collections projection", () => {
  it("groups certified cash snapshots by party without inventing zeros", () => {
    const bundle = {
      snapshots: [
        {
          id: "s1",
          orderId: "o1",
          countryId: "SA",
          currency: "SAR",
          paymentMethod: "cash" as const,
          grossFareMinor: 10000n,
          eligibleRevenueMinor: null,
          commissionAmountPersistedMinor: null,
          vatAmountMinor: null,
          driverDeductionsMinor: null,
          driverNetMinor: null,
          gatewayFeeMinor: null,
          driverId: "d1",
          agentId: null,
          agentShareMinor: null,
          agentAttributionStatus: "missing" as const,
          lifecycleCompleted: true,
          createdAtUtc: "2026-01-02T00:00:00.000Z",
          commissionRatePercent: null,
        },
        {
          id: "s2",
          orderId: "o2",
          countryId: "SA",
          currency: "SAR",
          paymentMethod: "card" as const,
          grossFareMinor: 5000n,
          eligibleRevenueMinor: null,
          commissionAmountPersistedMinor: null,
          vatAmountMinor: null,
          driverDeductionsMinor: null,
          driverNetMinor: null,
          gatewayFeeMinor: null,
          driverId: "d1",
          agentId: null,
          agentShareMinor: null,
          agentAttributionStatus: "missing" as const,
          lifecycleCompleted: true,
          createdAtUtc: "2026-01-03T00:00:00.000Z",
          commissionRatePercent: null,
        },
      ],
      settlements: [],
      payments: [],
      adjustments: [],
      refunds: [],
      chargebacks: [],
      payouts: [],
      activeAgentByCountry: {},
      synthetic: true,
    } as FinanceReportingSourceBundle;

    const rows = projectCashCollectionRows(bundle);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.partyId).toBe("d1");
    expect(rows[0]?.collectedMinor).toBe("10000");
    expect(rows[0]?.tripCount).toBe(1);
  });
});
