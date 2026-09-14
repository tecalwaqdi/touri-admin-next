/**
 * F4 — Agent party Fake settlement + attribution tests (D-08).
 */

import { describe, expect, it } from "vitest";
import {
  attributeAgentForNewQuote,
  createCountryActiveAgentRegistry,
  historicalOrUnknown,
  setActiveCountryAgent,
} from "@/domain/finance/v2/AgentAttribution";
import { buildTripFinancialSnapshot } from "@/domain/finance/v2/TripFinancialSnapshot";
import {
  buildAgentAccountingLine,
  buildDriverAccountingLine,
} from "@/domain/finance/v2/AccountingLine";
import { FakeSettlementV2Repository } from "@/repositories/fake/FakeSettlementV2Repository";
import { FINANCE_POLICY_BLOCKERS } from "@/domain/finance/v2/FinancePolicyBlockers";

describe("F4 Agent party Fake settlement + attribution", () => {
  it("historical snapshot attribution; missing → unknown_historical", () => {
    const snap = historicalOrUnknown({
      snapshotAgentId: "agt_hist",
      snapshotAmountMinor: 250n,
      snapshotRatePercent: 20,
      currentCountryAgentId: "agt_now",
    });
    expect(snap.status).toBe("snapshot");
    expect(snap.agentId).toBe("agt_hist");

    const missing = historicalOrUnknown({
      currentCountryAgentId: "agt_now",
    });
    expect(missing.status).toBe("unknown_historical");
    expect(missing.agentId).toBeNull();
  });

  it("agent amount does not reduce driver net / VAT / gross", () => {
    const trip = buildTripFinancialSnapshot({
      orderId: "o_agt",
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 10000n,
      platformCommissionMinor: 1500n,
      vatAmountMinor: 1500n,
      driverNetMinor: 7000n,
      paymentChannel: "cash",
      paymentStatus: "cash_collected",
      lifecycleCompleted: true,
      agentSnapshot: {
        agentId: "agt1",
        amountMinor: 300n,
        ratePercent: 20,
      },
    });
    expect(trip.majors.driverNet.amountMinor).toBe(7000n);
    expect(trip.majors.vatAmount.amountMinor).toBe(1500n);
    expect(trip.majors.grossFare.amountMinor).toBe(10000n);
    expect(trip.companyPlatformNet.amountMinor).toBe(1200n); // 1500-300
    const drv = buildDriverAccountingLine(trip, "drv1");
    expect(drv.amount.amountMinor).toBe(3000n); // gross-net; agent not subtracted
  });

  it("agent settlement Fake cycle draft → lock → pay", async () => {
    const trip = buildTripFinancialSnapshot({
      orderId: "o_agt2",
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 10000n,
      platformCommissionMinor: 1500n,
      vatAmountMinor: 1500n,
      driverNetMinor: 7000n,
      paymentChannel: "card",
      paymentStatus: "paid",
      lifecycleCompleted: true,
      agentSnapshot: { agentId: "agt1", amountMinor: 300n, ratePercent: 20 },
    });
    const agtLine = buildAgentAccountingLine(trip);
    expect(agtLine.eligibility.eligible).toBe(true);

    const repo = new FakeSettlementV2Repository();
    const draft = await repo.createDraft({
      partyType: "agent",
      partyId: "agt1",
      countryId: "SA",
      currency: "SAR",
      direction: "COMPANY_PAYS_AGENT",
      claims: [
        {
          lineId: agtLine.lineId,
          orderId: trip.majors.orderId,
          amountMinor: agtLine.amount.amountMinor!,
          currency: "SAR",
        },
      ],
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      createdByUserId: "accountant1",
      clientKey: "agt-settle-1",
      correlationId: "corr-agt",
    });
    const locked = await repo.lock({
      settlementId: draft.id,
      approverUserId: "approver1",
      clientKey: "lock-agt",
    });
    expect(locked.status).toBe("locked");
    const pay = await repo.createPayment({
      settlementId: draft.id,
      amountMinor: 300n,
      createdByUserId: "ops1",
      clientKey: "pay-agt",
    });
    const confirmed = await repo.confirmPayment({
      paymentId: pay.id,
      actorUserId: "ops1",
      clientKey: "confirm-agt",
    });
    expect(confirmed.settlement.status).toBe("settled");
    // F6 FC-03 APPROVED — Production write GO still separate
    expect(FINANCE_POLICY_BLOCKERS.FP_08_AGENT_SETTLEMENT_PRODUCTION).toMatch(
      /FC-03 APPROVED/,
    );
  });

  it("one country one active agent; cross-country separate", () => {
    const registry = createCountryActiveAgentRegistry();
    setActiveCountryAgent(registry, "SA", "agt_sa");
    setActiveCountryAgent(registry, "AE", "agt_ae");
    expect(() => setActiveCountryAgent(registry, "SA", "agt_other")).toThrow(
      /one_country_one_active_agent/,
    );
    const q = attributeAgentForNewQuote({
      countryId: "AE",
      registry,
      platformFeeMinor: 1000n,
      agentPercentOfPlatformFee: 10,
    });
    expect(q.agentId).toBe("agt_ae");
    expect(q.amountMinor).toBe(100n);
  });

  it("refuses productionApproved new quote attribution", () => {
    const registry = createCountryActiveAgentRegistry();
    setActiveCountryAgent(registry, "SA", "agt_sa");
    expect(() =>
      attributeAgentForNewQuote({
        countryId: "SA",
        registry,
        platformFeeMinor: 1000n,
        agentPercentOfPlatformFee: 10,
        productionApproved: true,
      }),
    ).toThrow(/not_production_approved/);
  });
});
