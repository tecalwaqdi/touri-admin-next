/**
 * F1 — Offline Finance domain contracts + Fake repos contract tests.
 * Covers REQ-17 scenarios for domain/Fake layer.
 */

import { describe, expect, it } from "vitest";
import {
  CALCULATION_PIPELINE_ORDER,
  FINANCE_WRITE_ENABLED_DEFAULT,
  assertFinanceWritesDisabled,
  buildFinanceIdempotencyKey,
  canTransitionSettlementV2,
  chargebackNotRepresented,
  moneyOrNull,
  resolveHistoricalAgentAttribution,
  settlementEligibleDriverNet,
  type TripFinancialMajors,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import { buildTripFinancialSnapshot } from "@/domain/finance/v2/TripFinancialSnapshot";
import {
  buildAgentAccountingLine,
  buildDriverAccountingLine,
} from "@/domain/finance/v2/AccountingLine";
import {
  percentOfMinorHalfUp,
  runHistoricalCalculationPipeline,
} from "@/domain/finance/v2/CalculationPipeline";
import {
  attributeAgentForNewQuote,
  createCountryActiveAgentRegistry,
  setActiveCountryAgent,
} from "@/domain/finance/v2/AgentAttribution";
import { FakeSettlementV2Repository } from "@/repositories/fake/FakeSettlementV2Repository";
import { FakeAccountingLineRepository } from "@/repositories/fake/FakeAccountingLineRepository";

function majors(
  partial: Partial<TripFinancialMajors> & Pick<TripFinancialMajors, "orderId">,
): TripFinancialMajors {
  const currency = partial.currency ?? "SAR";
  return {
    orderId: partial.orderId,
    currency,
    grossFare: partial.grossFare ?? moneyOrNull(10000n, currency),
    customerTotal: partial.customerTotal ?? moneyOrNull(10000n, currency),
    platformCommission: partial.platformCommission ?? moneyOrNull(1500n, currency),
    vatAmount: partial.vatAmount ?? moneyOrNull(1500n, currency),
    driverNet: partial.driverNet ?? moneyOrNull(7000n, currency),
    paymentChannel: partial.paymentChannel ?? "cash",
    paymentStatus: partial.paymentStatus ?? "cash_collected",
    lifecycleCompleted: partial.lifecycleCompleted ?? true,
  };
}

describe("F1 Finance implementation contracts (offline)", () => {
  it("keeps FINANCE_WRITE_ENABLED false by default", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    expect(() => assertFinanceWritesDisabled(false)).not.toThrow();
    expect(() => assertFinanceWritesDisabled(true)).toThrow(
      /FINANCE_WRITE_ENABLED/,
    );
  });

  it("never coerces missing majors to zero", () => {
    const m = moneyOrNull(null, "SAR");
    expect(m.amountMinor).toBeNull();
    expect(m.availability).toBe("missing");
    expect(m.amountMinor === 0n).toBe(false);
  });

  it("uses persisted driver net for settlement eligibility (D-FC-02)", () => {
    const ok = settlementEligibleDriverNet(
      majors({ orderId: "o1", driverNet: moneyOrNull(7000n, "SAR") }),
    );
    expect(ok.availability).toBe("available");
    expect(ok.amountMinor).toBe(7000n);

    const missing = settlementEligibleDriverNet(
      majors({ orderId: "o2", driverNet: moneyOrNull(null, "SAR") }),
    );
    expect(missing.availability).toBe("incomplete");
    expect(missing.amountMinor).toBeNull();
  });

  it("persisted driver net wins over derived", () => {
    const snap = buildTripFinancialSnapshot({
      orderId: "o_win",
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 10000n,
      platformCommissionMinor: 1500n,
      vatAmountMinor: 1500n,
      driverNetMinor: 6900n, // persisted differs from derived 7000
      paymentChannel: "cash",
      paymentStatus: "cash_collected",
      lifecycleCompleted: true,
    });
    expect(snap.derivedDriverNet.amountMinor).toBe(7000n);
    expect(snap.majors.driverNet.amountMinor).toBe(6900n);
    const line = buildDriverAccountingLine(snap, "drv");
    // Cash exposure uses persisted gross − persisted net
    expect(line.amount.amountMinor).toBe(3100n);
  });

  it("does not attribute historical trips to current country agent (D-08)", () => {
    const unknown = resolveHistoricalAgentAttribution({
      currentCountryAgentId: "agent-now",
    });
    expect(unknown.status).toBe("unknown_historical");
    expect(unknown.agentId).toBeNull();
    expect(unknown.amountMinor).toBeNull();

    const snap = resolveHistoricalAgentAttribution({
      snapshotAgentId: "agent-then",
      snapshotAmountMinor: 300n,
      snapshotRatePercent: 20,
      currentCountryAgentId: "agent-now",
    });
    expect(snap.status).toBe("snapshot");
    expect(snap.agentId).toBe("agent-then");
    expect(snap.amountMinor).toBe(300n);
  });

  it("marks chargebacks as not_represented with null amount (never zero)", () => {
    const cb = chargebackNotRepresented();
    expect(cb.availability).toBe("not_represented");
    expect(cb.amountMinor).toBeNull();
  });

  it("locks calculation pipeline order (D-07) and does not re-rate history", () => {
    expect(CALCULATION_PIPELINE_ORDER).toEqual([
      "gross_fare",
      "discounts",
      "eligibility",
      "platform_commission",
      "vat",
      "driver_net",
      "agent_share",
      "company_net",
      "settlement_positions",
      "settlement_aggregates",
    ]);
    const snap = buildTripFinancialSnapshot({
      orderId: "hist",
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
    const run = runHistoricalCalculationPipeline(snap);
    expect(run.mode).toBe("historical_persisted");
    expect(run.productionApproved).toBe(false);
    expect(
      run.stages.find((s) => s.stage === "platform_commission")?.reason,
    ).toMatch(/not_re_rated/);
    expect(run.policyBlockers.some((b) => b.includes("FINANCE_POLICY_UNRESOLVED_FC01"))).toBe(false);
  });

  it("half-up rounding for new/synthetic percent only", () => {
    // 1000 * 15% = 150 exact
    expect(percentOfMinorHalfUp(1000n, 15)).toBe(150n);
    // 333 * 15% = 49.95 → 50 half-up
    expect(percentOfMinorHalfUp(333n, 15)).toBe(50n);
  });

  it("uses V2 settlement transitions", () => {
    expect(canTransitionSettlementV2("draft", "locked")).toBe(true);
    expect(canTransitionSettlementV2("locked", "settled")).toBe(true);
    expect(canTransitionSettlementV2("settled", "voided")).toBe(false);
    expect(canTransitionSettlementV2("draft", "settled")).toBe(false);
  });

  it("builds deterministic idempotency keys", () => {
    const a = buildFinanceIdempotencyKey({
      actorUid: "u1",
      op: "settlement.lock",
      resourceType: "financial_settlements",
      resourceId: "s1",
      clientKey: "k1",
    });
    const b = buildFinanceIdempotencyKey({
      actorUid: "u1",
      op: "settlement.lock",
      resourceType: "financial_settlements",
      resourceId: "s1",
      clientKey: "k1",
    });
    expect(a).toBe(b);
    expect(a).toBe("u1|settlement.lock|financial_settlements|s1|k1");
  });

  it("one country = one active agent on new Fake quote path", () => {
    const registry = createCountryActiveAgentRegistry();
    setActiveCountryAgent(registry, "SA", "agt_a");
    expect(() => setActiveCountryAgent(registry, "SA", "agt_b")).toThrow(
      /one_country_one_active_agent/,
    );
    const attr = attributeAgentForNewQuote({
      countryId: "SA",
      registry,
      platformFeeMinor: 1500n,
      agentPercentOfPlatformFee: 20,
      productionApproved: false,
    });
    expect(attr.status).toBe("active_country_at_quote");
    expect(attr.agentId).toBe("agt_a");
    expect(attr.amountMinor).toBe(300n);
  });

  it("cash trip → eligible line; card trip → COMPANY_PAYS_DRIVER", () => {
    const cash = buildTripFinancialSnapshot({
      orderId: "c1",
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
    const cashLine = buildDriverAccountingLine(cash, "drv1");
    expect(cashLine.eligibility.eligible).toBe(true);
    expect(cashLine.direction).toBe("DRIVER_PAYS_COMPANY");
    expect(cashLine.amount.amountMinor).toBe(3000n);

    const card = buildTripFinancialSnapshot({
      orderId: "card1",
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 10000n,
      platformCommissionMinor: 1500n,
      vatAmountMinor: 1500n,
      driverNetMinor: 7000n,
      paymentChannel: "card",
      paymentStatus: "paid",
      lifecycleCompleted: true,
    });
    const cardLine = buildDriverAccountingLine(card, "drv1");
    expect(cardLine.eligibility.eligible).toBe(true);
    expect(cardLine.direction).toBe("COMPANY_PAYS_DRIVER");
    expect(cardLine.amount.amountMinor).toBe(7000n);
  });

  it("missing major → incomplete; not eligible; null not zero", () => {
    const snap = buildTripFinancialSnapshot({
      orderId: "miss",
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 10000n,
      platformCommissionMinor: 1500n,
      vatAmountMinor: null,
      driverNetMinor: null,
      paymentChannel: "cash",
      paymentStatus: "cash_collected",
      lifecycleCompleted: true,
    });
    expect(snap.majors.vatAmount.amountMinor).toBeNull();
    expect(snap.majors.driverNet.amountMinor).toBeNull();
    const line = buildDriverAccountingLine(snap, "drv");
    expect(line.eligibility.eligible).toBe(false);
    expect(line.amount.amountMinor).toBeNull();
  });

  it("agent line requires snapshot; company net incomplete without agent slice", () => {
    const snap = buildTripFinancialSnapshot({
      orderId: "no_agt",
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 10000n,
      platformCommissionMinor: 1500n,
      vatAmountMinor: 1500n,
      driverNetMinor: 7000n,
      paymentChannel: "cash",
      paymentStatus: "cash_collected",
      lifecycleCompleted: true,
      currentCountryAgentId: "current_agt",
    });
    expect(snap.agent.status).toBe("unknown_historical");
    const agt = buildAgentAccountingLine(snap);
    expect(agt.eligibility.eligible).toBe(false);
    expect(snap.companyPlatformNet.availability).toBe("incomplete");
  });
});

describe("F1 FakeSettlementV2Repository (offline flow)", () => {
  it("runs cash trip settlement: draft → lock → pay → settled", async () => {
    const repo = new FakeSettlementV2Repository();
    const draft = await repo.createDraft({
      partyType: "driver",
      partyId: "drv1",
      countryId: "SA",
      currency: "SAR",
      direction: "DRIVER_PAYS_COMPANY",
      claims: [
        {
          lineId: "drv_line_c1",
          orderId: "c1",
          amountMinor: 3000n,
          currency: "SAR",
        },
      ],
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      createdByUserId: "accountant1",
      clientKey: "cycle-1",
      correlationId: "corr-1",
    });
    expect(draft.status).toBe("draft");

    const again = await repo.createDraft({
      partyType: "driver",
      partyId: "drv1",
      countryId: "SA",
      currency: "SAR",
      direction: "DRIVER_PAYS_COMPANY",
      claims: [
        {
          lineId: "drv_line_c1",
          orderId: "c1",
          amountMinor: 3000n,
          currency: "SAR",
        },
      ],
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      createdByUserId: "accountant1",
      clientKey: "cycle-1",
      correlationId: "corr-1",
    });
    expect(again.id).toBe(draft.id);

    await expect(
      repo.lock({
        settlementId: draft.id,
        approverUserId: "accountant1",
        clientKey: "lock-1",
      }),
    ).rejects.toThrow(/dual_control/);

    const locked = await repo.lock({
      settlementId: draft.id,
      approverUserId: "approver1",
      clientKey: "lock-1",
    });
    expect(locked.status).toBe("locked");

    const pay1 = await repo.createPayment({
      settlementId: draft.id,
      amountMinor: 1000n,
      createdByUserId: "ops1",
      clientKey: "pay-partial",
    });
    const partial = await repo.confirmPayment({
      paymentId: pay1.id,
      actorUserId: "ops1",
      clientKey: "confirm-partial",
    });
    expect(partial.settlement.status).toBe("partially_paid");

    const pay2 = await repo.createPayment({
      settlementId: draft.id,
      amountMinor: 2000n,
      createdByUserId: "ops1",
      clientKey: "pay-rest",
    });
    const settled = await repo.confirmPayment({
      paymentId: pay2.id,
      actorUserId: "ops1",
      clientKey: "confirm-rest",
    });
    expect(settled.settlement.status).toBe("settled");
    expect(settled.settlement.paidConfirmedMinor).toBe(3000n);
  });

  it("card trip COMPANY_PAYS_DRIVER payout path", async () => {
    const repo = new FakeSettlementV2Repository();
    const draft = await repo.createDraft({
      partyType: "driver",
      partyId: "drv1",
      countryId: "SA",
      currency: "SAR",
      direction: "COMPANY_PAYS_DRIVER",
      claims: [
        {
          lineId: "drv_line_card",
          orderId: "card1",
          amountMinor: 7000n,
          currency: "SAR",
        },
      ],
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      createdByUserId: "accountant1",
      clientKey: "card-cycle",
      correlationId: "corr-card",
    });
    await repo.lock({
      settlementId: draft.id,
      approverUserId: "approver1",
      clientKey: "lock-card",
    });
    const pay = await repo.createPayment({
      settlementId: draft.id,
      amountMinor: 7000n,
      createdByUserId: "ops1",
      clientKey: "payout-full",
    });
    expect(pay.direction).toBe("COMPANY_PAYS_DRIVER");
    const confirmed = await repo.confirmPayment({
      paymentId: pay.id,
      actorUserId: "ops1",
      clientKey: "confirm-payout",
    });
    expect(confirmed.settlement.status).toBe("settled");
  });

  it("supports agent party settlements separate from driver cash positions", async () => {
    const repo = new FakeSettlementV2Repository();
    const agentSet = await repo.createDraft({
      partyType: "agent",
      partyId: "agt1",
      countryId: "SA",
      currency: "SAR",
      direction: "COMPANY_PAYS_AGENT",
      claims: [
        {
          lineId: "agt_line_c1",
          orderId: "c1",
          amountMinor: 300n,
          currency: "SAR",
        },
      ],
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      createdByUserId: "accountant1",
      clientKey: "agent-cycle-1",
      correlationId: "corr-agt",
    });
    expect(agentSet.partyType).toBe("agent");
    expect(agentSet.direction).toBe("COMPANY_PAYS_AGENT");

    await expect(
      repo.createDraft({
        partyType: "agent",
        partyId: "agt1",
        countryId: "SA",
        currency: "SAR",
        direction: "COMPANY_PAYS_AGENT",
        claims: [
          {
            lineId: "drv_line_c1",
            orderId: "c1",
            amountMinor: 3000n,
            currency: "SAR",
          },
        ],
        periodFromUtc: "2026-09-01T00:00:00.000Z",
        periodToUtc: "2026-09-07T00:00:00.000Z",
        createdByUserId: "accountant1",
        clientKey: "bad-agent",
        correlationId: "corr-bad",
      }),
    ).rejects.toThrow(/agent_settlement_driver_claim_forbidden/);
  });

  it("stores accounting lines in FakeAccountingLineRepository", async () => {
    const lines = new FakeAccountingLineRepository();
    const snap = buildTripFinancialSnapshot({
      orderId: "o_line",
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 10000n,
      platformCommissionMinor: 1500n,
      vatAmountMinor: 1500n,
      driverNetMinor: 7000n,
      paymentChannel: "cash",
      paymentStatus: "cash_collected",
      lifecycleCompleted: true,
      agentSnapshot: { agentId: "agt", amountMinor: 300n, ratePercent: 20 },
    });
    const drv = buildDriverAccountingLine(snap, "drv1");
    const agt = buildAgentAccountingLine(snap);
    await lines.put(drv);
    await lines.put(agt);
    const eligible = await lines.listEligible({
      partyType: "driver",
      partyId: "drv1",
      currency: "SAR",
    });
    expect(eligible).toHaveLength(1);
    expect(eligible[0].amount.amountMinor).toBe(3000n);
  });
});
