/**
 * FR6 Adjustments / Refunds / Chargebacks / Reversals — offline integrity + pilot prep.
 * Production writes = 0 in this suite.
 */

import { afterEach, describe, expect, it } from "vitest";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  createOfflineFakeFinanceWriteGate,
  createProductionFinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import { FakeFinanceAuditRepository } from "@/repositories/fake/FakeFinanceAuditRepository";
import { FakeSettlementV2Repository } from "@/repositories/fake/FakeSettlementV2Repository";
import { SettlementCommandService } from "@/application/finance/SettlementCommandService";
import { AdjustmentCommandService } from "@/application/finance/AdjustmentCommandService";
import { RefundAccountingCommandService } from "@/application/finance/rollout/RefundAccountingCommandService";
import { ChargebackAccountingCommandService } from "@/application/finance/rollout/ChargebackAccountingCommandService";
import { AccountingSnapshotCommandService } from "@/application/finance/rollout/AccountingSnapshotCommandService";
import {
  buildGatewayFeeComponent,
  GATEWAY_FEE_POLICY_APPROVED_F6,
} from "@/domain/finance/v2/policies/GatewayFeePolicyF6";
import { prepareFinanceFr6AdjustmentPilot } from "@/application/finance/pilot/FinanceFr6PilotPreparation";
import { runFinanceFr6AdjustmentPilotApply } from "@/application/finance/pilot/FinanceFr6PilotApply";
import { createFakeFinanceFr6ApplyFirestorePort } from "@/application/finance/pilot/FinanceFr6ApplyPorts";
import {
  FINANCE_FR6_ADJUSTMENT_PILOT_PASS,
  FINANCE_FR6_CANONICAL_MECHANISM,
  FINANCE_FR6_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR6_EXPECTED_WRITE_COUNTS,
  FINANCE_FR6_LIVE_PATH_DECISIONS,
  FINANCE_FR6_REQUIRED_RBAC_APPROVE,
  FINANCE_FR6_REQUIRED_RBAC_CREATE,
  FINANCE_FR6_SETTLEMENT_DOC_ID,
  FINANCE_FR6_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";
import { FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr6PilotIamDerivation";
import { evaluateFinanceFr6LiveArmGates } from "@/application/finance/pilot/FinanceFr6PilotGates";
import { isFinanceFr6AdjustmentPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr6AdjustmentPilotApplyEnabled";
import { ROLE_PERMISSION_MATRIX, hasPermission } from "@/permissions/rbac";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { loadEnv, resetEnvCache } from "@/config/env";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyFinanceFr6PilotLiveWriteEnvironment,
  captureFinanceFr6PilotOperatorLiveGates,
  loadFinanceFr6PilotLiveWriteEnv,
} from "@/test/helpers/financeFr6PilotOperatorLiveEnv";

const PREPARER: FinancePermission[] = [
  "finance:read",
  "finance:adjust",
  "settlements:prepare",
  "settlements:create",
];
const APPROVER: FinancePermission[] = [
  "finance:read",
  "finance:adjust_approve",
  "settlements:approve",
];
const EXECUTOR: FinancePermission[] = [
  "finance:read",
  "settlements:execute",
];
const REVERSER: FinancePermission[] = ["finance:read", "settlements:reverse"];

const PASS_GATES = {
  FINANCE_FR6_ADJUSTMENT_PILOT_APPLY: "1",
  FINANCE_WRITE_ENABLED: "true",
  GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
  PRODUCTION_WRITE_ENABLED: "false",
  DRIVER_WRITE_ENABLED: "false",
  AGENT_WRITE_ENABLED: "false",
  CUSTOMER_WRITE_ENABLED: "false",
  EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
  GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
  SOURCE: "fr5_settlement_settled",
  FIREBASE_ID_TOKEN: "unit-test-token-not-a-jwt",
  FINANCE_FR1_PILOT_APPLY: "",
  FINANCE_FR2_SETTLEMENT_PILOT_APPLY: "",
  FINANCE_FR3_RECON_PILOT_VERIFY: "",
  FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY: "",
  FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY: "",
} as const;

function seedFr5SettledPort(extra?: {
  adjustment?: Record<string, unknown> | null;
  idempotency?: Record<string, unknown> | null;
}) {
  return createFakeFinanceFr6ApplyFirestorePort({
    settlement: {
      id: FINANCE_FR6_SETTLEMENT_DOC_ID,
      status: "settled",
      direction: "DRIVER_PAYS_COMPANY",
      amountMinor: 1500,
      paidConfirmedMinor: 1500,
      currency: "SAR",
    },
    payment: {
      id: "test_adminnext_finance_fr5_settlement_payment_001",
      status: "confirmed",
      amountMinor: 1500,
      currency: "SAR",
    },
    snapshot: {
      id: "test_adminnext_finance_fr1_completed_001",
      grossFareMinor: 10000,
      commissionMinor: 1500,
      driverNetMinor: 8500,
    },
    adjustment: extra?.adjustment ?? null,
    idempotency: extra?.idempotency ?? null,
  });
}

describe("FR6 correction integrity + pilot prep", () => {
  it("keeps FINANCE_WRITE_ENABLED false and production gate denying writes", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const prod = createProductionFinanceWriteGate();
    expect(() => prod.requireWritable("adjustment.create")).toThrow();
  });

  it("prep PASS with adjustment-only live GO; refund/chargeback/settled-reverse NO-GO", () => {
    const prep = prepareFinanceFr6AdjustmentPilot();
    expect(prep.fr6PrepStatus).toBe("PASS");
    expect(prep.goNoGo).toBe("GO");
    expect(prep.livePilotSafe).toBe(true);
    expect(prep.productionWritesThisSession).toBe(0);
    expect(prep.exactExpectedWrites.totalProductionWrites).toBe(4);
    expect(prep.livePathDecisions).toEqual(FINANCE_FR6_LIVE_PATH_DECISIONS);
    expect(prep.canonicalMechanism).toBe(FINANCE_FR6_CANONICAL_MECHANISM);
    expect(prep.requiredRbacCreate).toBe(FINANCE_FR6_REQUIRED_RBAC_CREATE);
    expect(prep.requiredRbacApprove).toBe(FINANCE_FR6_REQUIRED_RBAC_APPROVE);
    expect(prep.requiredIamPermissions).toEqual([
      ...FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    ]);
    expect(prep.expectedAdcPrincipal).toBe(FINANCE_FR6_EXPECTED_ADC_PRINCIPAL);
  });

  it("valid adjustment + approval + duplicate + SoD + RBAC", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const adjustments = new AdjustmentCommandService(gate, audit);

    const adj = await adjustments.create(
      { userId: "acct1", permissions: PREPARER },
      {
        countryId: "SA",
        currency: "SAR",
        amountMinor: 25n,
        reason: "rounding_correction",
        direction: "neutral_memo",
        responsibleParty: "company",
        relatedOrderId: "ord_1",
        relatedSettlementId: "set_1",
        sourceCurrency: "SAR",
        maxAmountMinor: 1500n,
        clientKey: "adj-1",
        correlationId: "c1",
      },
    );
    expect(adj.status).toBe("draft");
    expect(adj.mutatesOrderMajors).toBe(false);
    expect(adj.mutatesFr1Principal).toBe(false);

    const dup = await adjustments.create(
      { userId: "acct1", permissions: PREPARER },
      {
        countryId: "SA",
        currency: "SAR",
        amountMinor: 99n,
        reason: "other",
        direction: "neutral_memo",
        relatedOrderId: "ord_1",
        relatedSettlementId: "set_1",
        clientKey: "adj-1",
        correlationId: "c1",
      },
    );
    expect(dup.id).toBe(adj.id);
    expect(dup.amountMinor).toBe(25n);

    await expect(
      adjustments.approve(
        { userId: "acct1", permissions: APPROVER },
        { adjustmentId: adj.id, correlationId: "c1" },
      ),
    ).rejects.toThrow(/dual_control_violation/);

    const approved = await adjustments.approve(
      { userId: "apr1", permissions: APPROVER },
      { adjustmentId: adj.id, correlationId: "c1" },
    );
    expect(approved.status).toBe("approved");
    expect(approved.approvedByUserId).toBe("apr1");

    await expect(
      adjustments.create(
        { userId: "ops", permissions: EXECUTOR },
        {
          countryId: "SA",
          currency: "SAR",
          amountMinor: 1n,
          reason: "x",
          direction: "neutral_memo",
          relatedOrderId: "ord_1",
          clientKey: "x",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/rbac_denied:finance:adjust/);
  });

  it("adjustment over limit, wrong currency, missing reason, missing source", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const adjustments = new AdjustmentCommandService(gate, audit);
    const base = {
      countryId: "SA",
      currency: "SAR",
      amountMinor: 25n,
      reason: "ok",
      direction: "neutral_memo" as const,
      relatedOrderId: "ord_1",
      clientKey: "k",
      correlationId: "c",
    };

    await expect(
      adjustments.create(
        { userId: "acct1", permissions: PREPARER },
        { ...base, amountMinor: 2000n, maxAmountMinor: 1500n, clientKey: "ol" },
      ),
    ).rejects.toThrow(/adjustment_over_limit/);

    await expect(
      adjustments.create(
        { userId: "acct1", permissions: PREPARER },
        { ...base, sourceCurrency: "AED", clientKey: "wc" },
      ),
    ).rejects.toThrow(/currency_mismatch/);

    await expect(
      adjustments.create(
        { userId: "acct1", permissions: PREPARER },
        { ...base, reason: "  ", clientKey: "mr" },
      ),
    ).rejects.toThrow(/missing_reason/);

    await expect(
      adjustments.create(
        { userId: "acct1", permissions: PREPARER },
        {
          ...base,
          relatedOrderId: null,
          relatedSettlementId: null,
          clientKey: "ms",
        },
      ),
    ).rejects.toThrow(/missing_source/);
  });

  it("cross-country denial and missing financial value fail-closed", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const adjustments = new AdjustmentCommandService(gate, audit);
    const refunds = new RefundAccountingCommandService(gate, audit);

    await expect(
      adjustments.create(
        { userId: "acct1", permissions: PREPARER, countryIds: ["SA"] },
        {
          countryId: "AE",
          currency: "AED",
          amountMinor: 1n,
          reason: "x",
          direction: "neutral_memo",
          relatedOrderId: "o",
          clientKey: "cc",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/cross_country_denied/);

    await expect(
      refunds.record(
        { userId: "acct1", permissions: PREPARER },
        {
          relatedOrderId: "ord_card",
          sessionId: "sess",
          countryId: "SA",
          currency: "SAR",
          amountMinor: null,
          kind: "customer_refund",
          paymentChannel: "card",
          reason: "r",
          clientKey: "nz",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/missing_value_fail_closed:refund_amount/);
  });

  it("reversal of confirmed payment; double reverse; settled reverse denied; reverse > original", async () => {
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
        direction: "DRIVER_PAYS_COMPANY",
        claims: [
          {
            lineId: "l1",
            orderId: "ord1",
            amountMinor: 1500n,
            currency: "SAR",
          },
        ],
        periodFromUtc: "2026-09-01T00:00:00.000Z",
        periodToUtc: "2026-09-07T00:00:00.000Z",
        clientKey: "s1",
        correlationId: "c",
      },
    );
    await settlements.lock(
      { userId: "apr1", permissions: APPROVER },
      { settlementId: draft.id, clientKey: "lock", correlationId: "c" },
    );
    const pay = await settlements.createPayment(
      { userId: "ops1", permissions: EXECUTOR },
      {
        settlementId: draft.id,
        amountMinor: 1500n,
        clientKey: "p1",
        correlationId: "c",
      },
    );
    const confirmed = await settlements.confirmPayment(
      { userId: "ops1", permissions: EXECUTOR },
      { paymentId: pay.id, clientKey: "c1", correlationId: "c" },
    );
    expect(confirmed.settlement.status).toBe("settled");
    expect(confirmed.payment.status).toBe("confirmed");

    await expect(
      settlements.reversePayment(
        { userId: "rev1", permissions: REVERSER },
        {
          paymentId: pay.id,
          reason: "reopen",
          clientKey: "r1",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/settled_history_immutable/);

    // partial path for valid reverse
    const draft2 = await settlements.createDraft(
      { userId: "acct1", permissions: PREPARER },
      {
        partyType: "driver",
        partyId: "drv1",
        countryId: "SA",
        currency: "SAR",
        direction: "DRIVER_PAYS_COMPANY",
        claims: [
          {
            lineId: "l2",
            orderId: "ord2",
            amountMinor: 3000n,
            currency: "SAR",
          },
        ],
        periodFromUtc: "2026-09-01T00:00:00.000Z",
        periodToUtc: "2026-09-07T00:00:00.000Z",
        clientKey: "s2",
        correlationId: "c",
      },
    );
    await settlements.lock(
      { userId: "apr1", permissions: APPROVER },
      { settlementId: draft2.id, clientKey: "lock2", correlationId: "c" },
    );
    const payA = await settlements.createPayment(
      { userId: "ops1", permissions: EXECUTOR },
      {
        settlementId: draft2.id,
        amountMinor: 1000n,
        clientKey: "pa",
        correlationId: "c",
      },
    );
    await settlements.confirmPayment(
      { userId: "ops1", permissions: EXECUTOR },
      { paymentId: payA.id, clientKey: "ca", correlationId: "c" },
    );
    const rev = await settlements.reversePayment(
      { userId: "rev1", permissions: REVERSER },
      {
        paymentId: payA.id,
        reason: "ops_error",
        clientKey: "ra",
        correlationId: "c",
      },
    );
    expect(rev.payment.status).toBe("reversed");
    expect(rev.settlement.status).toBe("locked");
    // settled payment retained as reversed row (not deleted)
    expect(rev.payment.id).toBe(payA.id);

    const dupRev = await settlements.reversePayment(
      { userId: "rev1", permissions: REVERSER },
      {
        paymentId: payA.id,
        reason: "ops_error",
        clientKey: "ra",
        correlationId: "c",
      },
    );
    expect(dupRev.payment.id).toBe(payA.id);

    await expect(
      settlements.reversePayment(
        { userId: "rev1", permissions: REVERSER },
        {
          paymentId: payA.id,
          reason: "again",
          clientKey: "ra2",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/payment_reverse_invalid/);
  });

  it("refund valid vs exceeds refundable; cash customer refund denied", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const refunds = new RefundAccountingCommandService(gate, audit);

    const ok = await refunds.record(
      { userId: "acct1", permissions: PREPARER },
      {
        relatedOrderId: "ord_card",
        sessionId: "sess_1",
        countryId: "SA",
        currency: "SAR",
        amountMinor: 500n,
        kind: "customer_refund",
        paymentChannel: "card",
        refundableAmountMinor: 9000n,
        reason: "partial",
        clientKey: "r1",
        correlationId: "c",
      },
    );
    expect(ok.mutatesOrderMajors).toBe(false);

    await expect(
      refunds.record(
        { userId: "acct1", permissions: PREPARER },
        {
          relatedOrderId: "ord_card2",
          sessionId: "sess_2",
          countryId: "SA",
          currency: "SAR",
          amountMinor: 10000n,
          kind: "customer_refund",
          paymentChannel: "card",
          refundableAmountMinor: 500n,
          reason: "too_much",
          clientKey: "r2",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/refund_exceeds_refundable/);

    await expect(
      refunds.record(
        { userId: "acct1", permissions: PREPARER },
        {
          relatedOrderId: "ord_cash",
          countryId: "SA",
          currency: "SAR",
          amountMinor: 100n,
          kind: "customer_refund",
          paymentChannel: "cash",
          reason: "invented",
          clientKey: "r3",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/refund_capability_absent/);

    const internal = await refunds.record(
      { userId: "acct1", permissions: PREPARER },
      {
        relatedOrderId: "ord_cash",
        countryId: "SA",
        currency: "SAR",
        amountMinor: 100n,
        kind: "internal_settlement_correction",
        paymentChannel: "cash",
        reason: "internal_memo",
        clientKey: "r4",
        correlationId: "c",
      },
    );
    expect(internal.kind).toBe("internal_settlement_correction");
  });

  it("chargeback known vs disputed; gateway fee separate; no silent driver/agent", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const chargebacks = new ChargebackAccountingCommandService(gate, audit);

    const known = await chargebacks.record(
      { userId: "acct1", permissions: PREPARER },
      {
        relatedOrderId: "ord_card",
        countryId: "SA",
        currency: "SAR",
        amountMinor: 1000n,
        feeAmountMinor: 50n,
        evidencePresent: true,
        liabilityParty: "company",
        reason: "cb_known",
        clientKey: "cb1",
        correlationId: "c",
      },
    );
    expect(known.liabilityParty).toBe("company");
    expect(known.feeAmountMinor).toBe(50n);
    expect(known.mutatesOrderMajors).toBe(false);

    const disputed = await chargebacks.record(
      { userId: "acct1", permissions: PREPARER },
      {
        relatedOrderId: "ord_card2",
        countryId: "SA",
        currency: "SAR",
        amountMinor: 1000n,
        feeAmountMinor: 50n,
        evidencePresent: false,
        disputed: true,
        reason: "cb_disputed",
        clientKey: "cb2",
        correlationId: "c",
      },
    );
    expect(disputed.status).toBe("disputed_suspense");
    expect(disputed.liabilityParty).toBe("disputed_suspense");

    await expect(
      chargebacks.record(
        { userId: "acct1", permissions: PREPARER },
        {
          relatedOrderId: "ord_card3",
          countryId: "SA",
          currency: "SAR",
          amountMinor: 1000n,
          feeAmountMinor: 50n,
          evidencePresent: true,
          liabilityParty: "company",
          mergedFeeIntoPrincipal: true,
          reason: "bad",
          clientKey: "cb3",
          correlationId: "c",
        },
      ),
    ).rejects.toThrow(/fee_merged/);

    const fee = buildGatewayFeeComponent({
      amountMinor: 40n,
      currency: "SAR",
      providerId: "paytabs",
    });
    expect(fee.owner).toBe("agent");
    expect(GATEWAY_FEE_POLICY_APPROVED_F6.defaultOwner).toBe("agent");
  });

  it("historical snapshot immutable; order immutable; settled payment retained", async () => {
    const gate = createOfflineFakeFinanceWriteGate();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const snaps = new AccountingSnapshotCommandService(gate, audit);
    const adjustments = new AdjustmentCommandService(gate, audit);

    const snap = await snaps.materialize(
      { userId: "acct1", permissions: PREPARER },
      {
        orderId: "ord_immut",
        countryId: "SA",
        currency: "SAR",
        grossFareMinor: 10000n,
        customerTotalMinor: 10000n,
        platformCommissionMinor: 1500n,
        vatAmountMinor: 1500n,
        driverNetMinor: 8500n,
        paymentChannel: "cash",
        paymentStatus: "cash_collected",
        lifecycleCompleted: true,
        driverId: "drv1",
        clientKey: "snap1",
        correlationId: "c",
      },
    );
    const dup = await snaps.materialize(
      { userId: "acct1", permissions: PREPARER },
      {
        orderId: "ord_immut",
        countryId: "SA",
        currency: "SAR",
        grossFareMinor: 1n,
        customerTotalMinor: 1n,
        platformCommissionMinor: 1n,
        vatAmountMinor: 1n,
        driverNetMinor: 1n,
        paymentChannel: "cash",
        paymentStatus: "cash_collected",
        lifecycleCompleted: true,
        driverId: "drv1",
        clientKey: "snap1",
        correlationId: "c",
      },
    );
    expect(dup.snapshot.majors.grossFare.amountMinor).toBe(10000n);
    expect(dup.id).toBe(snap.id);

    const adj = await adjustments.create(
      { userId: "acct1", permissions: PREPARER },
      {
        countryId: "SA",
        currency: "SAR",
        amountMinor: 25n,
        reason: "memo",
        direction: "neutral_memo",
        relatedOrderId: "ord_immut",
        relatedSettlementId: "set_x",
        clientKey: "a1",
        correlationId: "c",
      },
    );
    expect(adj.mutatesOrderMajors).toBe(false);
    expect(adj.mutatesFr1Principal).toBe(false);
  });

  it("RBAC matrix: execute ≠ adjust; reverse separate; accountant ≠ adjust_approve", () => {
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.operations_manager, "finance:adjust"),
    ).toBe(false);
    expect(
      hasPermission(
        ROLE_PERMISSION_MATRIX.operations_manager,
        "settlements:execute",
      ),
    ).toBe(true);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.accountant, "finance:adjust"),
    ).toBe(true);
    expect(
      hasPermission(
        ROLE_PERMISSION_MATRIX.accountant,
        "finance:adjust_approve",
      ),
    ).toBe(false);
    expect(
      hasPermission(
        ROLE_PERMISSION_MATRIX.finance_approver,
        "finance:adjust_approve",
      ),
    ).toBe(true);
    expect(
      hasPermission(
        ROLE_PERMISSION_MATRIX.finance_approver,
        "settlements:reverse",
      ),
    ).toBe(false);
  });

  it("live arm default SKIP; Fake apply GO path + already applied + wrong ADC", async () => {
    expect(isFinanceFr6AdjustmentPilotApplyEnabled(undefined)).toBe(false);
    const prepGates = evaluateFinanceFr6LiveArmGates({
      env: process.env,
      mode: "preparation",
    });
    expect(prepGates.allowed).toBe(false);

    const preparer = {
      uid: "finance_fr6_adjust_preparer_actor",
      role: "accountant",
      permissions: ["finance:read", "finance:adjust"] as FinancePermission[],
    };
    const approver = {
      uid: "finance_fr6_adjust_approver_actor",
      role: "finance_approver",
      permissions: [
        "finance:read",
        "finance:adjust_approve",
      ] as FinancePermission[],
    };

    const skip = await runFinanceFr6AdjustmentPilotApply({
      mode: "preparation",
      env: PASS_GATES,
      firestorePort: seedFr5SettledPort(),
      actor: preparer,
      approverActor: approver,
      skipIamPreflight: true,
    });
    expect(skip.status).toBe("PREP_SKIP");
    expect(skip.productionWrites).toBe(0);

    const applied = await runFinanceFr6AdjustmentPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      firestorePort: seedFr5SettledPort(),
      actor: preparer,
      approverActor: approver,
      skipIamPreflight: true,
    });
    expect(applied.status).toBe("APPLIED");
    expect(applied.passMarker).toBe(FINANCE_FR6_ADJUSTMENT_PILOT_PASS);
    expect(applied.productionWrites).toBe(
      FINANCE_FR6_EXPECTED_WRITE_COUNTS.totalProductionWrites,
    );

    const port2 = seedFr5SettledPort();
    const first = await runFinanceFr6AdjustmentPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      firestorePort: port2,
      actor: preparer,
      approverActor: approver,
      skipIamPreflight: true,
    });
    expect(first.status).toBe("APPLIED");
    const second = await runFinanceFr6AdjustmentPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      firestorePort: port2,
      actor: preparer,
      approverActor: approver,
      skipIamPreflight: true,
    });
    expect(second.status).toBe("ALREADY_APPLIED");
    expect(second.productionWrites).toBe(0);
    expect(second.writeCounts).toEqual(FINANCE_FR6_ZERO_WRITE_COUNTS);

    const wrongAdc = await runFinanceFr6AdjustmentPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      firestorePort: seedFr5SettledPort(),
      actor: preparer,
      approverActor: approver,
      resolvePrincipal: async () => ({
        credentialType: "authorized_user",
        principalEmail: "wrong@example.com",
      }),
      testIamPermissions: async () => [
        ...FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS,
      ],
    });
    expect(wrongAdc.status).toBe("IAM_DENIED");
    expect(wrongAdc.summary.denials).toContain("wrong_adc_principal");

    const missingToken = await runFinanceFr6AdjustmentPilotApply({
      mode: "live_apply",
      env: { ...PASS_GATES, FIREBASE_ID_TOKEN: "" },
      firestorePort: seedFr5SettledPort(),
      actorResolver: {
        async resolve() {
          return null;
        },
      },
      skipIamPreflight: true,
    });
    expect(missingToken.status).toBe("ACTOR_DENIED");
  });

  it("preserves FINANCE_FR6 apply arm through sanitization; never write flags globally", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR6_ADJUSTMENT_PILOT_APPLY: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });

  it("live env helper arms FINANCE_WRITE independently with Production bootstrap", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR6_ADJUSTMENT_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureFinanceFr6PilotOperatorLiveGates(env);
    applyFinanceFr6PilotLiveWriteEnvironment({ capturedGates: captured, env });
    expect(env.FINANCE_WRITE_ENABLED).toBe("true");
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe("false");
    expect(env.DRIVER_WRITE_ENABLED).toBe("false");
    expect(env.AGENT_WRITE_ENABLED).toBe("false");
    expect(env.CUSTOMER_WRITE_ENABLED).toBe("false");
    expect(env.SOURCE).toBe("fr5_settlement_settled");
    expect(env.APP_ENV).toBe("production");
    expect(env.NEXT_PUBLIC_APP_ENV).toBe("production");
    expect(env.EXPECTED_ENVIRONMENT).toBe("production");
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.NODE_ENV).toBe("production");
    expect(env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY).toBe("");
  });
});

describe("Finance FR6 live env bootstrap / env.ts safety (no Production writes)", () => {
  function wipeToSafeDefaults(): void {
    Object.assign(process.env, { NODE_ENV: "test" });
    process.env.APP_ENV = "development";
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    process.env.AUTH_MODE = "mock";
    process.env.EXPECTED_PROJECT_ID = "";
    process.env.EXPECTED_ENVIRONMENT = "development";
    process.env.GOOGLE_CLOUD_PROJECT = "";
    process.env.PRODUCTION_READ_ENABLED = "false";
    process.env.PRODUCTION_READ_MODE = "disabled";
    process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
    process.env.PRODUCTION_WRITE_ENABLED = "false";
    process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
    process.env.DRIVER_WRITE_ENABLED = "false";
    process.env.AGENT_WRITE_ENABLED = "false";
    process.env.CUSTOMER_WRITE_ENABLED = "false";
    process.env.FINANCE_WRITE_ENABLED = "false";
    process.env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY = "";
    process.env.SOURCE = "";
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    resetEnvCache();
  }

  afterEach(() => {
    wipeToSafeDefaults();
  });

  it("armed captured gates → live env validates as Production (loadEnv PASS)", () => {
    wipeToSafeDefaults();
    process.env.APP_ENV = "development";
    process.env.EXPECTED_ENVIRONMENT = "development";
    process.env.FIREBASE_ID_TOKEN = "fr6_unit_actor_token";

    const captured = captureFinanceFr6PilotOperatorLiveGates({
      FINANCE_FR6_ADJUSTMENT_PILOT_APPLY: "1",
      FINANCE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
      PRODUCTION_WRITE_ENABLED: "false",
      DRIVER_WRITE_ENABLED: "false",
      AGENT_WRITE_ENABLED: "false",
      CUSTOMER_WRITE_ENABLED: "false",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
      SOURCE: "fr5_settlement_settled",
      FIREBASE_ID_TOKEN: "fr6_unit_actor_token",
    });

    applyFinanceFr6PilotLiveWriteEnvironment({ capturedGates: captured });
    const env = loadFinanceFr6PilotLiveWriteEnv();
    expect(env.APP_ENV).toBe("production");
    expect(env.NODE_ENV).toBe("production");
    expect(env.EXPECTED_ENVIRONMENT).toBe("production");
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.FINANCE_WRITE_ENABLED).toBe(true);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(false);
    expect(env.EXPECTED_PROJECT_ID).toBe("tutorial-multi-language-70gx4j");
  });

  it("development + FINANCE_WRITE_ENABLED=true is still rejected by global env schema", () => {
    wipeToSafeDefaults();
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.APP_ENV = "development";
    process.env.EXPECTED_ENVIRONMENT = "development";
    process.env.AUTH_MODE = "mock";
    process.env.FINANCE_WRITE_ENABLED = "true";
    process.env.EXPECTED_PROJECT_ID = "tutorial-multi-language-70gx4j";
    resetEnvCache();
    expect(() => loadEnv()).toThrow(
      /forbidden in non-production|development startup/i,
    );
  });
});
