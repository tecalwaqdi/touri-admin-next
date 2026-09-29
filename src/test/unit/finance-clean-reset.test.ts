import { describe, expect, it } from "vitest";
import { buildFinanceCleanResetManifest } from "@/application/finance/cutover/FinanceCleanResetManifest";
import { applyFinanceCleanReset } from "@/application/finance/cutover/FinanceCleanResetApply";
import { FakeProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION } from "@/domain/finance/cutover/FinanceCleanResetScope";

describe("finance clean reset", () => {
  it("builds manifest with protected deletes = 0 and no order deletes", () => {
    const manifest = buildFinanceCleanResetManifest({
      scannedByCollection: {
        financial_settlements: 1,
        order: 2,
        wallets: 1,
        transactions: 1,
      },
      idsByCollection: {
        financial_settlements: ["test_adminnext_finance_fr2_settlement_v2_001"],
        order: ["order_real_001", "demo_fin_trip_001"],
        wallets: ["wallet_1"],
        transactions: ["admin_test_txn_1"],
        finance_audit_events: [],
      },
      impactRows: [
        {
          kind: "settlement",
          id: "test_adminnext_finance_fr2_settlement_v2_001",
          collection: "financial_settlements",
          class: "SYNTHETIC_QA_TEST",
          reasons: [],
          countryId: "saudi_arabia",
          currency: "SAR",
          partyType: "driver",
          partyId: "drv_1",
          amountMinor: "1500",
          carryForwardReceivableMinor: null,
          carryForwardPayableMinor: null,
          sourceReferences: ["order:demo_fin_trip_001"],
          provenanceProvenSynthetic: true,
        },
      ],
      wallets: [
        {
          walletId: "wallet_1",
          ownerType: "driver",
          ownerId: "drv_1",
          resolvedOwnerName: null,
          country: "saudi_arabia",
          currency: "SAR",
          storedBalanceMinor: "50000",
          storedBalanceAvailability: "available",
          transactionDerivedBalanceMinor: null,
          transactionDerivedAuthoritative: false,
          linkedSettlements: [],
          linkedPayments: [],
          linkedAdjustments: [],
          realOrSynthetic: "real",
          financialImpact: "HISTORICAL_INCOMPLETE",
          proposedCarryForwardAmountMinor: "50000",
          proposedDirection: null,
          sourceReferences: ["wallet:wallet_1"],
          reasons: [],
        },
      ],
      malformed: [],
    });

    expect(manifest.readyForApply).toBe(true);
    expect(manifest.blockers).toEqual([]);
    expect(manifest.protectedEntityAssertion.OPERATIONAL_ORDERS_TRIPS_TO_DELETE).toBe(0);
    expect(manifest.protectedEntityAssertion.WALLET_CONTAINERS_TO_DELETE).toBe(0);
    expect(manifest.protectedEntityAssertion.DRIVERS_TO_DELETE).toBe(0);
    expect(manifest.counts.operationalOrdersProposed).toBe(0);
    expect(manifest.counts.walletContainersDeleted).toBe(0);
    expect(
      manifest.entries.some((e) => e.collection === "order"),
    ).toBe(false);
    expect(
      manifest.entries.some(
        (e) =>
          e.collection === "wallets" && e.operation === "DELETE_FINANCE_FIXTURE",
      ),
    ).toBe(false);
    expect(
      manifest.entries.some(
        (e) =>
          e.collection === "wallets" && e.operation === "RESET_FINANCIAL_BALANCE",
      ),
    ).toBe(true);
    expect(manifest.openingPositionByOperatorConfirmation.driverOpening).toBe(
      "0.00",
    );
  });

  it("applies deletes and wallet resets without touching orders", async () => {
    const port = new FakeProductionFirestoreWritePort();
    port.seed("financial_settlements", "fin_1", { amountMinor: "100" });
    port.seed("wallets", "wal_1", { currentBalance: 50, walletBalance: 50 });
    port.seed("order", "order_keep", { status: "completed" });

    const manifest = buildFinanceCleanResetManifest({
      scannedByCollection: { financial_settlements: 1, wallets: 1, order: 1 },
      idsByCollection: {
        financial_settlements: ["fin_1"],
        wallets: ["wal_1"],
        order: ["order_keep"],
      },
      impactRows: [],
      wallets: [
        {
          walletId: "wal_1",
          ownerType: "unknown",
          ownerId: null,
          resolvedOwnerName: null,
          country: null,
          currency: "SAR",
          storedBalanceMinor: "5000",
          storedBalanceAvailability: "available",
          transactionDerivedBalanceMinor: null,
          transactionDerivedAuthoritative: false,
          linkedSettlements: [],
          linkedPayments: [],
          linkedAdjustments: [],
          realOrSynthetic: "real",
          financialImpact: "HISTORICAL_INCOMPLETE",
          proposedCarryForwardAmountMinor: "5000",
          proposedDirection: null,
          sourceReferences: [],
          reasons: [],
        },
      ],
      malformed: [],
    });

    const result = await applyFinanceCleanReset({
      port,
      manifest,
      operatorConfirmation: FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION,
      actorEmail: "info@admin.com",
    });

    expect(result.blockers).toEqual([]);
    expect(result.financeRecordsDeleted).toBe(1);
    expect(result.walletsMonetaryStateReset).toBe(1);
    expect(result.walletContainersDeleted).toBe(0);
    expect(result.protectedDeletes.ordersTrips).toBe(0);
    expect(result.unexpectedNonFinanceMutations).toBe(false);

    const order = await port.getDocument("order", "order_keep");
    expect(order.exists).toBe(true);
    const wallet = await port.getDocument("wallets", "wal_1");
    expect(wallet.exists).toBe(true);
    expect(wallet.data?.currentBalance).toBe(0);
    expect(wallet.data?.walletBalance).toBe(0);
    const sett = await port.getDocument("financial_settlements", "fin_1");
    expect(sett.exists).toBe(false);
  });
});
