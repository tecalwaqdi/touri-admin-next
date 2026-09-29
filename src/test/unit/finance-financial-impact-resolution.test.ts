import { describe, expect, it } from "vitest";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { resolveFinanceFinancialImpact } from "@/application/finance/cutover/FinanceFinancialImpactResolution";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { FINANCE_FR2_SETTLEMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";

describe("finance financial impact resolution", () => {
  it("classifies golden FR7 chain with UNCLASSIFIED=0 and no opening invent", () => {
    const bundle = buildFinanceFr7GoldenSourceBundle();
    const report = resolveFinanceFinancialImpact({
      bundle,
      extraDocs: {
        order: [
          {
            id: FINANCE_FR1_SYNTHETIC_ORDER_ID,
            exists: true,
            data: { status: "completed", countryId: "saudi_arabia" },
          },
        ],
        wallets: [
          {
            id: "wallet_real_drv_001",
            exists: true,
            data: {
              driverId: "drv_real_001",
              currentBalance: 25.5,
              currency: "SAR",
              countryId: "saudi_arabia",
              name: "Real Driver",
            },
          },
          {
            id: "wallet_zero_001",
            exists: true,
            data: {
              driverId: "drv_zero_001",
              currentBalance: 0,
              currency: "SAR",
            },
          },
        ],
        transactions: [],
        finance_audit_events: [
          { id: "audit_ref_001", exists: true, data: { type: "note" } },
        ],
      },
      malformedDocs: [
        {
          collection: "financial_settlements",
          id: "demo_fin_settlement_001",
          problems: ["settlement_party_invalid"],
          moneyFieldsPresent: ["amountMinor"],
          linkedParty: null,
          linkedOrderId: "demo_fin_trip_001",
          linkedSettlementId: null,
          currency: "SAR",
          rawKeys: ["id", "currency", "amountMinor"],
        },
        {
          collection: "financial_settlements",
          id: "iOYduoa6IXPdkUUdhHLq",
          problems: ["settlement_party_invalid"],
          moneyFieldsPresent: ["amountMinor", "paidConfirmedMinor"],
          linkedParty: null,
          linkedOrderId: null,
          linkedSettlementId: null,
          currency: "SAR",
          rawKeys: ["id", "currency"],
        },
      ],
      cutoverUtcInstant: "2026-09-30T21:00:00.000Z",
    });

    expect(report.dryRun).toBe(true);
    expect(report.productionWrites).toBe(0);
    expect(report.unclassified).toBe(0);
    expect(report.readyForCutoverApply).toBe(false);
    expect(report.syntheticDeleteManifest.realRecordsToDelete).toBe(0);
    expect(report.counts.SYNTHETIC_QA_TEST).toBeGreaterThan(0);
    expect(report.idsByClass.SYNTHETIC_QA_TEST).toContain(
      FINANCE_FR2_SETTLEMENT_DOC_ID,
    );
    expect(report.malformed.blockers.map((b) => b.id)).toContain(
      "iOYduoa6IXPdkUUdhHLq",
    );
    // demo malformed → synthetic class
    expect(report.malformed.resolved.map((b) => b.id)).toContain(
      "demo_fin_settlement_001",
    );
    // Non-zero real wallet without settlement direction → incomplete, not opening
    const nonzero = report.wallets.nonzeroReal.find(
      (w) => w.walletId === "wallet_real_drv_001",
    );
    expect(nonzero?.financialImpact).toBe("HISTORICAL_INCOMPLETE");
    expect(
      report.openingBalances.driver.some((d) => d.partyId === "drv_real_001"),
    ).toBe(false);
    expect(report.wallets.reviewed).toHaveLength(2);
  });

  it("marks wallet stored vs txn mismatch as HISTORICAL_CONFLICT", () => {
    const bundle = buildFinanceFr7GoldenSourceBundle();
    const report = resolveFinanceFinancialImpact({
      bundle,
      extraDocs: {
        wallets: [
          {
            id: "wal_conflict",
            exists: true,
            data: {
              driverId: "drv_conflict",
              currentBalance: 10,
              currency: "SAR",
            },
          },
        ],
        transactions: [
          {
            id: "txn1",
            exists: true,
            data: {
              walletId: "wal_conflict",
              driverId: "drv_conflict",
              amount: 5,
              direction: "credit",
              currency: "SAR",
            },
          },
        ],
        order: [],
      },
      malformedDocs: [],
      cutoverUtcInstant: "2026-09-30T21:00:00.000Z",
    });
    expect(report.wallets.conflicts).toHaveLength(1);
    expect(report.wallets.conflicts[0]?.financialImpact).toBe(
      "HISTORICAL_CONFLICT",
    );
  });
});
