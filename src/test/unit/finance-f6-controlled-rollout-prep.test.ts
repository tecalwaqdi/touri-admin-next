/**
 * F6 policy closure + Controlled Finance Rollout offline prep tests.
 * FINANCE_WRITE_ENABLED remains false. Production writes = 0.
 */

import { describe, expect, it } from "vitest";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { percentOfMinorHalfUp } from "@/domain/finance/v2/CalculationPipeline";
import { buildTripFinancialSnapshot } from "@/domain/finance/v2/TripFinancialSnapshot";
import { buildDriverAccountingLine } from "@/domain/finance/v2/AccountingLine";
import { hasBlockerVariance } from "@/domain/reconciliation/Variance";
import {
  FINANCE_POLICY_UNRESOLVED_FC01,
  isFinancePolicyUnresolvedFc01,
} from "@/domain/finance/v2/policies/FinancePolicyCodes";
import {
  createOfflineApprovedCommissionRateFixture,
  LEGACY_PLATFORM_COMMISSION_15_PERCENT_EVIDENCE,
  PLATFORM_COMMISSION_POLICY_CONFIG_REQUIRED,
  requireApprovedPlatformCommissionRate,
} from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  DISCOUNT_TREATMENT_POLICY_APPROVED_F6,
  mayAutoReduceDriverNetByDiscountUnderFc02,
  resolveDiscountAccounting,
} from "@/domain/finance/v2/policies/DiscountTreatmentPolicyF6";
import {
  AGENT_SETTLEMENT_POLICY_APPROVED_F6,
  assertCardNotCombinedWithAgentCash,
  buildAgentSettlementExposure,
} from "@/domain/finance/v2/policies/AgentSettlementPolicyF6";
import {
  CHARGEBACK_ACCOUNTING_POLICY_APPROVED_F6,
  resolveChargebackLiability,
} from "@/domain/finance/v2/policies/ChargebackAccountingPolicyF6";
import {
  GATEWAY_FEE_POLICY_APPROVED_F6,
  buildGatewayFeeComponent,
} from "@/domain/finance/v2/policies/GatewayFeePolicyF6";
import {
  f6PolicyClosureSummary,
  FINANCE_POLICY_REGISTRY_F6,
  isFinancePolicyApproved,
} from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import {
  createCountryActiveAgentRegistry,
  setActiveCountryAgent,
} from "@/domain/finance/v2/AgentAttribution";
import { ROLE_PERMISSION_MATRIX, hasPermission } from "@/permissions/rbac";
import {
  createOfflineFakeFinanceWriteGate,
  createProductionFinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import { FakeFinanceAuditRepository } from "@/repositories/fake/FakeFinanceAuditRepository";
import { FakeSettlementV2Repository } from "@/repositories/fake/FakeSettlementV2Repository";
import { SettlementCommandService } from "@/application/finance/SettlementCommandService";
import { AdjustmentCommandService } from "@/application/finance/AdjustmentCommandService";
import { ReconciliationService } from "@/application/finance/ReconciliationService";
import { FakeReconciliationRepository } from "@/repositories/fake/FakeReconciliationRepository";
import { AccountingSnapshotCommandService } from "@/application/finance/rollout/AccountingSnapshotCommandService";
import { RefundAccountingCommandService } from "@/application/finance/rollout/RefundAccountingCommandService";
import { ChargebackAccountingCommandService } from "@/application/finance/rollout/ChargebackAccountingCommandService";
import {
  PayoutPreparationCommandService,
  SettlementExecutionPreparationService,
} from "@/application/finance/rollout/PayoutPreparationCommandService";
import {
  FINANCE_ROLLOUT_OP_SPECS,
  FINANCE_ROLLOUT_PHASE_OPS,
  FR7_REPORTING_READ_SPEC,
} from "@/application/finance/rollout/FinanceRolloutOperationSpecs";
import {
  buildFinanceControlledRolloutPreparationStatus,
  runFinanceControlledRolloutHarnessOffline,
} from "@/application/finance/rollout/FinanceControlledRolloutHarness";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

const VIEWER: FinancePermission[] = ["finance:read"];
const PREPARER: FinancePermission[] = [
  "finance:read",
  "settlements:prepare",
  "settlements:create",
  "finance:adjust",
  "payouts:prepare",
];
const APPROVER: FinancePermission[] = [
  "finance:read",
  "settlements:approve",
  "finance:adjust_approve",
];
const EXECUTOR: FinancePermission[] = [
  "finance:read",
  "settlements:execute",
  "payouts:prepare",
  "payouts:execute",
];
const REVERSER: FinancePermission[] = ["finance:read", "settlements:reverse"];

describe("F6 Finance policy closure", () => {
  it("keeps FINANCE_WRITE_ENABLED false", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
  });

  it("locks FC-01..FC-05 APPROVED (FC-01 at 15% versioned)", () => {
    const s = f6PolicyClosureSummary();
    expect(s.f6Status).toBe("PASS");
    expect(s.fc01).toBe("APPROVED");
    expect(s.fc02).toBe("APPROVED");
    expect(s.fc03).toBe("APPROVED");
    expect(s.fc04).toBe("APPROVED");
    expect(s.fc05).toBe("APPROVED");
    expect(s.fc01ApprovedRatePercent).toBe(15);
    expect(s.legacy15PromotedToVersionedConfig).toBe(true);
    expect(isFinancePolicyApproved("FC-02")).toBe(true);
    expect(isFinancePolicyApproved("FC-01")).toBe(true);
    expect(FINANCE_POLICY_REGISTRY_F6["FC-01"].productionWriteReady).toBe(false);
  });

  it("FC-01 approved 15% resolves; missing config still fail-closed", () => {
    expect(PLATFORM_COMMISSION_POLICY_CONFIG_REQUIRED.ratePercent).toBeNull();
    expect(LEGACY_PLATFORM_COMMISSION_15_PERCENT_EVIDENCE.productionApproved).toBe(
      false,
    );
    expect(() =>
      requireApprovedPlatformCommissionRate(
        PLATFORM_COMMISSION_POLICY_CONFIG_REQUIRED,
      ),
    ).toThrow(FINANCE_POLICY_UNRESOLVED_FC01);

    try {
      requireApprovedPlatformCommissionRate(null);
    } catch (e) {
      expect(isFinancePolicyUnresolvedFc01(e)).toBe(true);
    }

    const fixture = createOfflineApprovedCommissionRateFixture({
      ratePercent: 12,
    });
    expect(
      requireApprovedPlatformCommissionRate(fixture, {
        allowOfflineFixture: true,
      }),
    ).toBe(12);
    expect(() => requireApprovedPlatformCommissionRate(fixture)).toThrow(
      /production_not_approved/,
    );
  });

  it("FC-02 discount: preserve gross, funding owner required, missing ≠ 0", () => {
    expect(DISCOUNT_TREATMENT_POLICY_APPROVED_F6.status).toBe("approved");
    expect(mayAutoReduceDriverNetByDiscountUnderFc02()).toBe(false);

    const missing = resolveDiscountAccounting({
      currency: "SAR",
      grossFareMinor: null,
      customerTotalMinor: null,
    });
    expect(missing.amountMinor).toBeNull();
    expect(missing.amountMinor).not.toBe(0n);
    expect(missing.policyBlocked).toBe(true);
    expect(missing.grossFarePreserved).toBe(true);

    const unknownOwner = resolveDiscountAccounting({
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 9000n,
      fundingOwner: null,
    });
    expect(unknownOwner.amountMinor).toBe(1000n);
    expect(unknownOwner.policyBlocked).toBe(true);

    const company = resolveDiscountAccounting({
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 9000n,
      fundingOwner: "company",
    });
    expect(company.policyBlocked).toBe(false);
    expect(company.fundingOwner).toBe("company");

    for (const owner of ["agent", "driver", "campaign"] as const) {
      const d = resolveDiscountAccounting({
        currency: "SAR",
        grossFareMinor: 10000n,
        customerTotalMinor: 9500n,
        fundingOwner: owner,
      });
      expect(d.policyBlocked).toBe(false);
      expect(d.fundingOwner).toBe(owner);
    }
  });

  it("FC-03 agent settlement: cash vs card separate; one-active-agent", () => {
    expect(AGENT_SETTLEMENT_POLICY_APPROVED_F6.status).toBe("approved");
    const cash = buildAgentSettlementExposure({
      currency: "SAR",
      paymentChannel: "cash",
      agentCollectedCashMinor: 7000n,
      owedToCompanyMinor: 1500n,
      owedToAgentMinor: 300n,
      adjustmentsMinor: 0n,
      paidMinor: 0n,
    });
    expect(cash.collectedCashMinor).toBe(7000n);
    expect(cash.companyCardReceiptsMinor).toBe(0n);
    expect(cash.outstandingMinor).toBe(1800n);
    assertCardNotCombinedWithAgentCash(cash);

    expect(() =>
      buildAgentSettlementExposure({
        currency: "SAR",
        paymentChannel: "card",
        agentCollectedCashMinor: 100n,
        companyCardReceiptsMinor: 7000n,
      }),
    ).toThrow(/fc03_card_must_not_be_agent_cash/);

    const card = buildAgentSettlementExposure({
      currency: "SAR",
      paymentChannel: "card",
      companyCardReceiptsMinor: 7000n,
      owedToAgentMinor: 300n,
    });
    expect(card.collectedCashMinor).toBe(0n);
    expect(card.companyCardReceiptsMinor).toBe(7000n);

    const registry = createCountryActiveAgentRegistry();
    setActiveCountryAgent(registry, "SA", "agt1");
    expect(() => setActiveCountryAgent(registry, "SA", "agt2")).toThrow(
      /one_country_one_active_agent/,
    );
  });

  it("FC-04 chargeback: disputed suspense; liability with evidence; fees separate", () => {
    expect(CHARGEBACK_ACCOUNTING_POLICY_APPROVED_F6.status).toBe("approved");
    expect(
      resolveChargebackLiability({ evidencePresent: false }),
    ).toBe("disputed_suspense");
    expect(
      resolveChargebackLiability({
        evidencePresent: true,
        disputed: true,
        liabilityParty: "driver",
      }),
    ).toBe("disputed_suspense");
    expect(
      resolveChargebackLiability({
        evidencePresent: true,
        liabilityParty: "company",
      }),
    ).toBe("company");
  });

  it("FC-05 gateway fee: independent; default agent; never silent deduct", () => {
    expect(GATEWAY_FEE_POLICY_APPROVED_F6.status).toBe("approved");
    expect(GATEWAY_FEE_POLICY_APPROVED_F6.currentOpsElectronicFeeMinorSar).toBe(
      100n,
    );
    expect(GATEWAY_FEE_POLICY_APPROVED_F6.defaultOwner).toBe("agent");
    const missing = buildGatewayFeeComponent({ currency: "SAR" });
    expect(missing.amountMinor).toBeNull();
    expect(missing.owner).toBe("agent");
    expect(missing.deductedFromDriverEarnings).toBe(false);
    expect(missing.deductedFromAgentEarnings).toBe(false);

    const electronic = buildGatewayFeeComponent({
      currency: "SAR",
      paymentChannel: "card",
    });
    expect(electronic.amountMinor).toBe(100n);
    expect(electronic.amountSource).toBe("current_ops_electronic_1_sar");
    expect(electronic.currency).toBe("SAR");
    expect(electronic.owner).toBe("agent");
    expect(electronic.deductedFromDriverEarnings).toBe(false);

    const cash = buildGatewayFeeComponent({
      currency: "SAR",
      paymentChannel: "cash",
    });
    expect(cash.amountMinor).toBe(0n);
    expect(cash.amountSource).toBe("current_ops_cash_zero");

    const historicalWins = buildGatewayFeeComponent({
      currency: "SAR",
      paymentChannel: "card",
      historicalPersistedMinor: 40n,
    });
    expect(historicalWins.amountMinor).toBe(40n);
    expect(historicalWins.amountSource).toBe("historical_persisted");

    const override = buildGatewayFeeComponent({
      currency: "SAR",
      amountMinor: 50n,
      countryId: "SA",
      providerId: "paytabs",
      contracts: [
        { countryId: "SA", providerId: "paytabs", owner: "shared_contract" },
      ],
    });
    expect(override.owner).toBe("shared_contract");
    expect(override.deductedFromDriverEarnings).toBe(false);
  });

  it("rounding half-up for explicit approved rate fixture", () => {
    expect(percentOfMinorHalfUp(1000n, 12.5)).toBe(125n);
  });
});

describe("Finance RBAC F6 / FR", () => {
  it("separates view/prepare/approve/execute/adjust/payout/export", () => {
    expect(hasPermission(ROLE_PERMISSION_MATRIX.accountant, "settlements:prepare")).toBe(
      true,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.accountant, "payouts:prepare")).toBe(
      true,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.accountant, "settlements:approve")).toBe(
      false,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.accountant, "settlements:execute")).toBe(
      false,
    );
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.finance_approver, "settlements:approve"),
    ).toBe(true);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.finance_approver, "settlements:execute"),
    ).toBe(false);
    expect(hasPermission(ROLE_PERMISSION_MATRIX.operations_manager, "payouts:execute")).toBe(
      true,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.country_admin, "finance:read")).toBe(
      true,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.country_admin, "settlements:prepare")).toBe(
      true,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.agent_user, "finance:read")).toBe(true);
    expect(hasPermission(ROLE_PERMISSION_MATRIX.agent_user, "settlements:execute")).toBe(
      false,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.auditor, "finance:read")).toBe(true);
    expect(hasPermission(ROLE_PERMISSION_MATRIX.auditor, "settlements:create")).toBe(
      false,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.reporting_viewer, "reports:export")).toBe(
      true,
    );
    expect(hasPermission(ROLE_PERMISSION_MATRIX.super_admin, "payouts:execute")).toBe(
      true,
    );
  });
});

describe("FR1–FR7 controlled Finance rollout offline prep", () => {
  it("defines all ops with write counts production=0", () => {
    for (const [op, spec] of Object.entries(FINANCE_ROLLOUT_OP_SPECS)) {
      expect(spec.expectedWriteCounts.production).toBe(0);
      expect(spec.idempotencyKeyPattern.length).toBeGreaterThan(5);
      expect(spec.forbiddenWrites.length).toBeGreaterThan(0);
      expect(spec.postWriteVerification).toContain("production_writes=0");
      expect(op).toBeTruthy();
    }
    expect(FINANCE_ROLLOUT_PHASE_OPS.FR1).toContain("materialize_accounting_snapshot");
    expect(FR7_REPORTING_READ_SPEC.expectedWriteCounts.production).toBe(0);
  });

  it("harness SKIP by default; never enables writes", () => {
    const status = buildFinanceControlledRolloutPreparationStatus();
    expect(status.skipped).toBe(true);
    expect(status.financeWriteEnabled).toBe(false);
    expect(status.productionWrites).toBe(0);
    expect(status.pilotGoNoGo).toBe("NO-GO");
    expect(status.phases.FR1.status).toBe("PREPARED");
    expect(status.phases.FR7.status).toBe("PREPARED");
    expect(status.remainingBlockers).not.toContain("FC-01_CONFIG_REQUIRED");
    expect(status.remainingBlockers).toContain("FINANCE_WRITE_ENABLED=false");

    const armed = runFinanceControlledRolloutHarnessOffline({
      ...process.env,
      PHASE_FINANCE_CONTROLLED_ROLLOUT: "1",
      FINANCE_WRITE_ENABLED: "false",
    });
    expect(armed.skipped).toBe(false);
    expect(armed.productionWrites).toBe(0);

    expect(() =>
      runFinanceControlledRolloutHarnessOffline({
        ...process.env,
        FINANCE_WRITE_ENABLED: "true",
      }),
    ).toThrow(/must remain false/);
  });

  it("cash + card snapshot, settlement, recon, approve, prep, adj, reverse, refund, chargeback, payout", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const auditRepo = new FakeFinanceAuditRepository();
    const audit = new FinanceAuditService(auditRepo);
    const snaps = new AccountingSnapshotCommandService(gate, audit);
    const settlements = new SettlementCommandService(
      new FakeSettlementV2Repository(),
      gate,
      audit,
    );
    const recon = new ReconciliationService(
      new FakeReconciliationRepository(),
      gate,
      audit,
    );
    const adjustments = new AdjustmentCommandService(gate, audit);
    const refunds = new RefundAccountingCommandService(gate, audit);
    const chargebacks = new ChargebackAccountingCommandService(gate, audit);
    const payPrep = new SettlementExecutionPreparationService(gate, audit);
    const payouts = new PayoutPreparationCommandService(gate, audit);

    const cashSnap = await snaps.materialize(
      { userId: "acct1", permissions: PREPARER, countryIds: ["SA"] },
      {
        orderId: "ord_cash_fr",
        countryId: "SA",
        currency: "SAR",
        grossFareMinor: 10000n,
        customerTotalMinor: 10000n,
        platformCommissionMinor: 1500n,
        vatAmountMinor: 1500n,
        driverNetMinor: 7000n,
        paymentChannel: "cash",
        paymentStatus: "cash_collected",
        lifecycleCompleted: true,
        driverId: "drv1",
        agentSnapshot: { agentId: "agt1", amountMinor: 300n, ratePercent: 20 },
        discountFundingOwner: "company",
        clientKey: "cash-1",
        correlationId: "corr-fr",
      },
    );
    expect(cashSnap.mutatesOrderMajors).toBe(false);
    expect(cashSnap.immutableHash).toMatch(/^snap_/);

    // historical immutability + idempotent duplicate
    const dup = await snaps.materialize(
      { userId: "acct1", permissions: PREPARER, countryIds: ["SA"] },
      {
        orderId: "ord_cash_fr",
        countryId: "SA",
        currency: "SAR",
        grossFareMinor: 99999n,
        customerTotalMinor: 99999n,
        platformCommissionMinor: 1n,
        vatAmountMinor: 1n,
        driverNetMinor: 1n,
        paymentChannel: "cash",
        paymentStatus: "cash_collected",
        lifecycleCompleted: true,
        driverId: "drv1",
        clientKey: "cash-1",
        correlationId: "corr-fr",
      },
    );
    expect(dup.id).toBe(cashSnap.id);
    expect(dup.snapshot.majors.driverNet.amountMinor).toBe(7000n);

    const cardSnap = await snaps.materialize(
      { userId: "acct1", permissions: PREPARER },
      {
        orderId: "ord_card_fr",
        countryId: "SA",
        currency: "SAR",
        grossFareMinor: 10000n,
        customerTotalMinor: 9000n,
        platformCommissionMinor: 1500n,
        vatAmountMinor: 1500n,
        driverNetMinor: 7000n,
        paymentChannel: "card",
        paymentStatus: "paid",
        lifecycleCompleted: true,
        driverId: "drv1",
        discountFundingOwner: "campaign",
        gatewayFeeMinor: 40n,
        providerId: "paytabs",
        clientKey: "card-1",
        correlationId: "corr-fr",
      },
    );
    expect(cardSnap.discountPolicyBlocked).toBe(false);

    await expect(
      snaps.materialize(
        { userId: "acct1", permissions: PREPARER, countryIds: ["SA"] },
        {
          orderId: "ord_ae",
          countryId: "AE",
          currency: "AED",
          grossFareMinor: 100n,
          customerTotalMinor: 100n,
          platformCommissionMinor: 10n,
          vatAmountMinor: 10n,
          driverNetMinor: 80n,
          paymentChannel: "cash",
          paymentStatus: "cash_collected",
          lifecycleCompleted: true,
          driverId: "drv2",
          clientKey: "x",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/cross_country_denied/);

    await expect(
      snaps.materialize(
        { userId: "viewer", permissions: VIEWER },
        {
          orderId: "ord_rbac",
          countryId: "SA",
          currency: "SAR",
          grossFareMinor: 100n,
          customerTotalMinor: 100n,
          platformCommissionMinor: 10n,
          vatAmountMinor: 10n,
          driverNetMinor: 80n,
          paymentChannel: "cash",
          paymentStatus: "cash_collected",
          lifecycleCompleted: true,
          driverId: "drv",
          clientKey: "r",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/rbac_denied/);

    await expect(
      snaps.materialize(
        { userId: "acct1", permissions: PREPARER },
        {
          orderId: "ord_missing",
          countryId: "SA",
          currency: "SAR",
          grossFareMinor: 100n,
          customerTotalMinor: 100n,
          platformCommissionMinor: 10n,
          vatAmountMinor: 10n,
          driverNetMinor: null,
          paymentChannel: "cash",
          paymentStatus: "cash_collected",
          lifecycleCompleted: true,
          driverId: "drv",
          clientKey: "m",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/missing_value_fail_closed/);

    const draft = await settlements.createDraft(
      { userId: "acct1", permissions: PREPARER },
      {
        partyType: "driver",
        partyId: "drv1",
        countryId: "SA",
        currency: "SAR",
        direction: "DRIVER_PAYS_COMPANY",
        claims: [
          {
            lineId: "l1",
            orderId: "ord_cash_fr",
            amountMinor: 3000n,
            currency: "SAR",
          },
        ],
        periodFromUtc: "2026-09-01T00:00:00.000Z",
        periodToUtc: "2026-09-07T00:00:00.000Z",
        clientKey: "set-1",
        correlationId: "corr-fr",
      },
    );

    const agentDraft = await settlements.createDraft(
      { userId: "acct1", permissions: PREPARER },
      {
        partyType: "agent",
        partyId: "agt1",
        countryId: "SA",
        currency: "SAR",
        direction: "COMPANY_PAYS_AGENT",
        claims: [
          {
            lineId: "agt_line_ord_cash_fr",
            orderId: "ord_cash_fr",
            amountMinor: 300n,
            currency: "SAR",
          },
        ],
        periodFromUtc: "2026-09-01T00:00:00.000Z",
        periodToUtc: "2026-09-07T00:00:00.000Z",
        clientKey: "set-agt",
        correlationId: "corr-fr",
      },
    );
    expect(agentDraft.partyType).toBe("agent");

    const reconSnap = buildTripFinancialSnapshot({
      orderId: "ord_cash_fr",
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 10000n,
      platformCommissionMinor: 1500n,
      vatAmountMinor: 1500n,
      driverNetMinor: 7000n,
      paymentChannel: "cash",
      paymentStatus: "cash_collected",
      lifecycleCompleted: true,
    });
    const reconLine = buildDriverAccountingLine(reconSnap, "drv1");
    const reconRun = await recon.run({
      actor: { userId: "acct1", permissions: VIEWER },
      countryId: "SA",
      currency: "SAR",
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      clientKey: "recon-1",
      correlationId: "corr-fr",
      snapshots: [
        {
          orderId: "ord_cash_fr",
          orderMajorDriverNetMinor: 7000n,
          accountingLine: reconLine,
          settlementClaimMinor: 2900n,
        },
      ],
    });
    expect(hasBlockerVariance(reconRun.variances)).toBe(true);

    const locked = await settlements.lock(
      { userId: "apr1", permissions: APPROVER },
      { settlementId: draft.id, clientKey: "lock", correlationId: "corr-fr" },
    );
    expect(locked.status).toBe("locked");

    // partial then full via payment prep (not live) + offline confirm
    const intent = await payPrep.prepare(
      { userId: "ops1", permissions: EXECUTOR },
      {
        settlementId: draft.id,
        currency: "SAR",
        amountMinor: 1500n,
        clientKey: "prep-partial",
        correlationId: "corr-fr",
      },
    );
    expect(intent.liveExecute).toBe(false);
    expect(intent.status).toBe("prepared");

    const pay1 = await settlements.createPayment(
      { userId: "ops1", permissions: EXECUTOR },
      {
        settlementId: draft.id,
        amountMinor: 1500n,
        clientKey: "pay-partial",
        correlationId: "corr-fr",
      },
    );
    const partial = await settlements.confirmPayment(
      { userId: "ops1", permissions: EXECUTOR },
      { paymentId: pay1.id, clientKey: "c1", correlationId: "corr-fr" },
    );
    expect(partial.settlement.status).toBe("partially_paid");

    // reverse confirmed payment while partially_paid (settled history immutable)
    const reversed = await settlements.reversePayment(
      { userId: "rev1", permissions: REVERSER },
      {
        paymentId: pay1.id,
        reason: "ops_error",
        clientKey: "rev",
        correlationId: "corr-fr",
      },
    );
    expect(reversed.payment.status).toBe("reversed");
    expect(reversed.settlement.status).toBe("locked");

    const pay2 = await settlements.createPayment(
      { userId: "ops1", permissions: EXECUTOR },
      {
        settlementId: draft.id,
        amountMinor: 3000n,
        clientKey: "pay-full",
        correlationId: "corr-fr",
      },
    );
    const full = await settlements.confirmPayment(
      { userId: "ops1", permissions: EXECUTOR },
      { paymentId: pay2.id, clientKey: "c2", correlationId: "corr-fr" },
    );
    expect(full.settlement.status).toBe("settled");

    // settled payment reverse denied — append-only adjustment instead
    await expect(
      settlements.reversePayment(
        { userId: "rev1", permissions: REVERSER },
        {
          paymentId: pay2.id,
          reason: "cannot_reopen_settled",
          clientKey: "rev-settled",
          correlationId: "corr-fr",
        },
      ),
    ).rejects.toThrow(/settled_history_immutable/);

    // duplicate execution idempotent at payment create layer (same clientKey)
    const payDup = await settlements.createPayment(
      { userId: "ops1", permissions: EXECUTOR },
      {
        settlementId: draft.id,
        amountMinor: 3000n,
        clientKey: "pay-full",
        correlationId: "corr-fr",
      },
    );
    expect(payDup.id).toBe(pay2.id);

    const adj = await adjustments.create(
      { userId: "acct1", permissions: PREPARER },
      {
        countryId: "SA",
        currency: "SAR",
        amountMinor: 25n,
        reason: "rounding_correction",
        direction: "decrease_company_claim",
        relatedOrderId: "ord_cash_fr",
        relatedSettlementId: draft.id,
        clientKey: "adj",
        correlationId: "corr-fr",
      },
    );
    expect(adj.mutatesOrderMajors).toBe(false);
    await adjustments.approve(
      { userId: "apr1", permissions: APPROVER },
      { adjustmentId: adj.id, correlationId: "corr-fr" },
    );

    const refund = await refunds.record(
      { userId: "acct1", permissions: PREPARER },
      {
        relatedOrderId: "ord_card_fr",
        sessionId: "sess_1",
        countryId: "SA",
        currency: "SAR",
        amountMinor: 500n,
        kind: "customer_refund",
        paymentChannel: "card",
        refundableAmountMinor: 9000n,
        reason: "customer_partial_refund",
        clientKey: "ref",
        correlationId: "corr-fr",
      },
    );
    expect(refund.mutatesOrderMajors).toBe(false);

    const cb = await chargebacks.record(
      { userId: "acct1", permissions: PREPARER },
      {
        relatedOrderId: "ord_card_fr",
        countryId: "SA",
        currency: "SAR",
        amountMinor: 1000n,
        feeAmountMinor: 50n,
        evidencePresent: true,
        liabilityParty: "company",
        clientKey: "cb1",
        correlationId: "corr-fr",
      },
    );
    expect(cb.feeAmountMinor).toBe(50n);
    expect(cb.liabilityParty).toBe("company");

    const disputed = await chargebacks.record(
      { userId: "acct1", permissions: PREPARER },
      {
        relatedOrderId: "ord_card_fr2",
        countryId: "SA",
        currency: "SAR",
        amountMinor: 200n,
        feeAmountMinor: null,
        evidencePresent: false,
        clientKey: "cb2",
        correlationId: "corr-fr",
      },
    );
    expect(disputed.status).toBe("disputed_suspense");

    const payout = await payouts.prepare(
      { userId: "ops1", permissions: EXECUTOR },
      {
        settlementId: draft.id,
        currency: "SAR",
        amountMinor: 1500n,
        clientKey: "payout",
        correlationId: "corr-fr",
      },
    );
    expect(payout.liveProviderCall).toBe(false);
    const ready = await payouts.transition(
      { userId: "ops1", permissions: EXECUTOR },
      {
        payoutId: payout.id,
        to: "ready_for_execute",
        correlationId: "corr-fr",
      },
    );
    expect(ready.status).toBe("ready_for_execute");
    expect(ready.liveProviderCall).toBe(false);

    // Production gate denies
    const prod = createProductionFinanceWriteGate();
    const prodSnaps = new AccountingSnapshotCommandService(prod, audit);
    await expect(
      prodSnaps.materialize(
        { userId: "acct1", permissions: PREPARER },
        {
          orderId: "ord_prod",
          countryId: "SA",
          currency: "SAR",
          grossFareMinor: 100n,
          customerTotalMinor: 100n,
          platformCommissionMinor: 10n,
          vatAmountMinor: 10n,
          driverNetMinor: 80n,
          paymentChannel: "cash",
          paymentStatus: "cash_collected",
          lifecycleCompleted: true,
          driverId: "drv",
          clientKey: "p",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/production_finance_write_denied/);

    expect(auditRepo.all().length).toBeGreaterThan(10);
  });

  it("company settlement draft direction COMPANY_PAYS_DRIVER for card", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const settlements = new SettlementCommandService(
      new FakeSettlementV2Repository(),
      gate,
      audit,
    );
    const draft = await settlements.createDraft(
      { userId: "acct1", permissions: PREPARER },
      {
        partyType: "driver",
        partyId: "drv1",
        countryId: "SA",
        currency: "SAR",
        direction: "COMPANY_PAYS_DRIVER",
        claims: [
          {
            lineId: "card_line",
            orderId: "ord_card_fr",
            amountMinor: 7000n,
            currency: "SAR",
          },
        ],
        periodFromUtc: "2026-09-01T00:00:00.000Z",
        periodToUtc: "2026-09-07T00:00:00.000Z",
        clientKey: "company-pay",
        correlationId: "c",
      },
    );
    expect(draft.direction).toBe("COMPANY_PAYS_DRIVER");
  });
});
