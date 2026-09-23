import { describe, expect, it } from "vitest";
import {
  runHistoricalSaudiFinanceRecoveryDryRun,
  type FinanceRecoveryScanPort,
} from "@/application/finance/materialize/HistoricalSaudiFinanceRecoveryDryRun";

const SAUDI_REF =
  "projects/x/databases/(default)/documents/countries/saudi_arabia";

describe("runHistoricalSaudiFinanceRecoveryDryRun", () => {
  it("recovers majors from V1 aliases without writing or re-rating", async () => {
    const port: FinanceRecoveryScanPort = {
      async listOrdersPage() {
        return {
          docs: [
            {
              id: "sa_missing_canonical_alias_ok",
              data: {
                status_code: "completed",
                PaymentMethod: "Cash",
                payment_status: "cash_collected",
                currency: "SAR",
                Rev_dolh: SAUDI_REF,
                // Canonical majors missing; V1 aliases present
                deliveryFees: 100,
                appProfit: 15,
                total_vat: 0,
                repCommission: 85,
                production_financial: true,
              },
            },
            {
              id: "sa_empty_incomplete",
              data: {
                status_code: "accepted",
                PaymentMethod: "Cash",
                payment_status: "pending_cash",
                currency: "SAR",
                Rev_dolh: SAUDI_REF,
              },
            },
            {
              id: "sa_inconsistent",
              data: {
                status_code: "completed",
                PaymentMethod: "Cash",
                payment_status: "cash_collected",
                currency: "SAR",
                Rev_dolh: SAUDI_REF,
                total_mndob2: 50,
                total_app: 10,
                total_vat: 5,
                total_mndob: 43, // expected 35
                production_financial: true,
              },
            },
            {
              id: "demo_fin_trip_001",
              data: {
                status_code: "completed",
                PaymentMethod: "Cash",
                payment_status: "cash_collected",
                currency: "SAR",
                Rev_dolh: SAUDI_REF,
                total_mndob2: 100,
                total_app: 15,
                total_vat: 0,
                total_mndob: 85,
              },
            },
          ],
          nextCursor: null,
        };
      },
      async getSnapshot() {
        return { exists: false, data: null };
      },
      async queryFinanceEqual() {
        return [];
      },
      async queryRoEqual() {
        return [];
      },
    };

    const result = await runHistoricalSaudiFinanceRecoveryDryRun({ port });
    expect(result.dryRun).toBe(true);
    expect(result.productionWrites).toBe(0);
    expect(result.orderMutations).toBe(0);
    expect(result.settlementWrites).toBe(0);
    expect(result.counts.missingFacts).toBeGreaterThanOrEqual(1);
    expect(result.counts.inconsistent).toBe(1);

    const recovered = result.trips.find(
      (t) => t.orderId === "sa_missing_canonical_alias_ok",
    );
    expect(recovered?.recoverable).toBe("yes_full");
    expect(recovered?.proposedSafeBackfill.map((p) => p.targetOrderField).sort()).toEqual(
      ["total_app", "total_mndob", "total_mndob2"].sort(),
    );

    const empty = result.trips.find((t) => t.orderId === "sa_empty_incomplete");
    expect(empty?.recoverable).toBe("no");

    const inconsistent = result.inconsistentDetail;
    expect(inconsistent?.orderId).toBe("sa_inconsistent");
    expect(inconsistent?.recoverable).toBe("no");
    expect(inconsistent?.proposedSafeBackfill).toEqual([]);
    expect(inconsistent?.competingValues.some((c) => c.field === "arithmetic_identity")).toBe(
      true,
    );
    expect(result.trips.every((t) => t.orderId !== "demo_fin_trip_001")).toBe(
      true,
    );
  });
});
