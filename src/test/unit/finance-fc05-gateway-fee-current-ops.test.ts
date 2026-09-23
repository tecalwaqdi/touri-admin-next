/**
 * FC-05 current-ops: 1.00 trip-currency per electronic payment; cash = 0;
 * owner = Agent; all countries. Historical persisted amounts remain authoritative.
 */

import { describe, expect, it } from "vitest";
import {
  CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR,
  GATEWAY_FEE_POLICY_APPROVED_F6,
  buildGatewayFeeComponent,
  resolveCurrentOpsGatewayFeeMinor,
} from "@/domain/finance/v2/policies/GatewayFeePolicyF6";
import { evaluateCertifiedAccountingSnapshotEligibility } from "@/domain/finance/v2/CertifiedSnapshotEligibility";
import {
  createOfflineFakeFinanceWriteGate,
  createProductionFinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import { FakeFinanceAuditRepository } from "@/repositories/fake/FakeFinanceAuditRepository";
import { AccountingSnapshotCommandService } from "@/application/finance/rollout/AccountingSnapshotCommandService";
import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { assertCalculatedMatchesLockedFixture } from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import {
  mapLegacyWalletBalance,
  mapLegacyWalletDoc,
} from "@/domain/finance/wallet/DriverWalletReadModels";
import { FakeDriverWalletReadAdapter } from "@/adapters/finance/wallet/FakeDriverWalletReadAdapter";
import { DriverWalletReadService } from "@/application/finance/wallet/DriverWalletReadService";

const PREPARER = ["settlements:prepare"] as const;

describe("FC-05 current-ops gateway fee (agent, 1 unit, all markets)", () => {
  it("locks 100 minor electronic fee; owner agent; all countries", () => {
    expect(CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR).toBe(100n);
    expect(GATEWAY_FEE_POLICY_APPROVED_F6.defaultOwner).toBe("agent");
    expect(GATEWAY_FEE_POLICY_APPROVED_F6.appliesAllCountries).toBe(true);
    expect(GATEWAY_FEE_POLICY_APPROVED_F6.productionApproved).toBe(false);

    expect(
      resolveCurrentOpsGatewayFeeMinor({
        paymentChannel: "card",
        currency: "SAR",
      }),
    ).toEqual({
      amountMinor: 100n,
      availability: "available",
      amountSource: "current_ops_electronic_1unit",
    });

    expect(
      resolveCurrentOpsGatewayFeeMinor({
        paymentChannel: "card",
        currency: "AED",
      }).amountMinor,
    ).toBe(100n);

    expect(
      resolveCurrentOpsGatewayFeeMinor({
        paymentChannel: "cash",
        currency: "SAR",
      }).amountMinor,
    ).toBe(0n);

    const fee = buildGatewayFeeComponent({
      currency: "SAR",
      paymentChannel: "card",
    });
    expect(fee.owner).toBe("agent");
    expect(fee.deductedFromAgentEarnings).toBe(false);
    expect(fee.amountMinor).toBe(100n);
  });

  it("never reprices historical persisted gateway fee", () => {
    const historical = buildGatewayFeeComponent({
      currency: "SAR",
      paymentChannel: "card",
      historicalPersistedMinor: 15n,
    });
    expect(historical.amountMinor).toBe(15n);
    expect(historical.amountSource).toBe("historical_persisted");
    expect(historical.owner).toBe("agent");
  });

  it("materializes NEW card snapshot with 100 minor + agent owner", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const snaps = new AccountingSnapshotCommandService(gate, audit);

    const card = await snaps.materialize(
      { userId: "acct1", permissions: [...PREPARER] },
      {
        orderId: "ord_card_fee",
        countryId: "SA",
        currency: "SAR",
        grossFareMinor: 10000n,
        customerTotalMinor: 10000n,
        platformCommissionMinor: 1500n,
        vatAmountMinor: 1500n,
        driverNetMinor: 8500n,
        paymentChannel: "card",
        paymentStatus: "paid",
        lifecycleCompleted: true,
        driverId: "drv1",
        clientKey: "card_fee_1",
        correlationId: "c",
      },
    );
    expect(card.gatewayFeeMinor).toBe(100n);
    expect(card.gatewayFeeOwner).toBe("agent");
    expect(card.gatewayFeeAmountSource).toBe("current_ops_electronic_1unit");
  });

  it("blocks snapshot when payment incomplete", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const snaps = new AccountingSnapshotCommandService(gate, audit);
    await expect(
      snaps.materialize(
        { userId: "acct1", permissions: [...PREPARER] },
        {
          orderId: "ord_pending",
          countryId: "SA",
          currency: "SAR",
          grossFareMinor: 10000n,
          customerTotalMinor: 10000n,
          platformCommissionMinor: 1500n,
          vatAmountMinor: 1500n,
          driverNetMinor: 8500n,
          paymentChannel: "card",
          paymentStatus: "processing",
          lifecycleCompleted: true,
          driverId: "drv1",
          clientKey: "pending_1",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/payment_not_complete/);
  });

  it("FR1 cash fixture calculator emits gatewayFeeMinor=0 owner=agent", () => {
    const calculated = calculateFinanceFr1PilotSnapshot({
      order: {
        documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
        data: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC.orderPayload as unknown as Record<
          string,
          unknown
        >,
      },
      actorUserId: "u1",
      discountFundingOwner: "company",
      asOfUtc: "2026-09-13T21:00:00.000Z",
    });
    expect(calculated.gatewayFeeMinor).toBe("0");
    expect(calculated.gatewayFeeOwner).toBe("agent");
    expect(calculated.snapshotEligibilityTrigger).toBe(
      "trip_completed_and_payment_complete",
    );
    expect(assertCalculatedMatchesLockedFixture(calculated)).toEqual([]);
  });

  it("eligibility: completed + paid; not at driver_assigned alone", () => {
    expect(
      evaluateCertifiedAccountingSnapshotEligibility({
        lifecycleStatus: "completed",
        paymentChannel: "card",
        paymentStatus: "paid",
      }).eligible,
    ).toBe(true);

    expect(
      evaluateCertifiedAccountingSnapshotEligibility({
        lifecycleStatus: "driver_assigned",
        paymentChannel: "card",
        paymentStatus: "paid",
      }).eligible,
    ).toBe(false);

    expect(
      evaluateCertifiedAccountingSnapshotEligibility({
        lifecycleStatus: "completed",
        paymentChannel: "cash",
        paymentStatus: "cash_collected",
      }).trigger,
    ).toBe("trip_completed_and_payment_complete");
  });

  it("Production Finance write remains gated", () => {
    const denied = createProductionFinanceWriteGate({
      FINANCE_WRITE_ENABLED: false,
    }).assertWritable("snapshot.materialize");
    expect(denied.allowed).toBe(false);
  });
});

describe("Driver wallets RO (missing ≠ 0)", () => {
  it("maps missing balance as missing not zero", () => {
    const b = mapLegacyWalletBalance({});
    expect(b.amountMinor).toBeNull();
    expect(b.availability).toBe("missing");

    const w = mapLegacyWalletDoc({
      id: "w1",
      data: { driverId: "d1", currency: "SAR" },
    });
    expect(w.balance.amountMinor).toBeNull();
    expect(w.balance.availability).toBe("missing");
  });

  it("prefers currentBalance over walletBalance", () => {
    const b = mapLegacyWalletBalance({
      currentBalance: 12.5,
      walletBalance: 99,
      currency: "SAR",
    });
    expect(b.amountMinor).toBe("1250");
    expect(b.sourceField).toBe("currentBalance");
  });

  it("Fake adapter returns empty honestly", async () => {
    const svc = new DriverWalletReadService(new FakeDriverWalletReadAdapter());
    const list = await svc.list();
    expect(list.items).toEqual([]);
    expect(list.warnings).toContain("no_wallet_records");
    expect(list.productionWrites).toBe(0);
  });
});
