/**
 * F2 — Production Finance read adapter (shadow DTOs, zero writes).
 */

import { describe, expect, it } from "vitest";
import {
  ProductionFinanceReadAdapter,
  mapFinancialSettlementDoc,
  mapOrderToTripFinancialSnapshot,
} from "@/adapters/finance/ProductionFinanceReadAdapter";
import {
  FIXTURE_CARD_ORDER,
  FIXTURE_CASH_ORDER,
  FIXTURE_MISSING_MAJOR_ORDER,
  FIXTURE_V2_SETTLEMENT,
} from "@/test/fixtures/finance/financeFixtures";

describe("F2 ProductionFinanceReadAdapter", () => {
  const adapter = new ProductionFinanceReadAdapter();

  it("maps cash order majors to shadow DTO without inventing rates", () => {
    const shadow = adapter.shadowTrip({
      ...FIXTURE_CASH_ORDER,
      data: { ...FIXTURE_CASH_ORDER.data, status_code: "completed" },
    });

    expect(shadow.productionWrites).toBe(0);
    expect(shadow.trip.productionApproved).toBe(false);
    expect(shadow.trip.grossFareMinor).toBe("10000");
    expect(shadow.trip.platformCommissionMinor).toBe("1500");
    expect(shadow.trip.vatAmountMinor).toBe("1500");
    expect(shadow.trip.driverNetMinor).toBe("7000");
    expect(shadow.trip.driverNetProvenance).toBe("persisted");
    expect(shadow.trip.agentAttributionStatus).toBe("snapshot");
    expect(shadow.trip.chargebackAmountMinor).toBeNull();
    expect(shadow.trip.chargebackAvailability).toBe("not_represented");
    expect(shadow.driverLine.eligible).toBe(true);
    expect(shadow.driverLine.direction).toBe("DRIVER_PAYS_COMPANY");
    expect(shadow.trip.policyBlockers.some((b) => b.includes("FINANCE_POLICY_UNRESOLVED_FC01"))).toBe(
      false,
    );
  });

  it("maps card order to COMPANY_PAYS_DRIVER line", () => {
    const shadow = adapter.shadowTrip(FIXTURE_CARD_ORDER);
    expect(shadow.driverLine.direction).toBe("COMPANY_PAYS_DRIVER");
    expect(shadow.driverLine.amountMinor).toBe("7000");
    expect(shadow.agentLine.eligible).toBe(true);
    expect(shadow.agentLine.amountMinor).toBe("300");
  });

  it("missing majors → null not zero; line ineligible", () => {
    const shadow = adapter.shadowTrip(FIXTURE_MISSING_MAJOR_ORDER);
    expect(shadow.trip.vatAmountMinor).toBeNull();
    expect(shadow.trip.driverNetMinor).toBeNull();
    expect(shadow.trip.driverNetProvenance).not.toBe("persisted");
    expect(shadow.driverLine.eligible).toBe(false);
    expect(shadow.driverLine.amountMinor).toBeNull();
  });

  it("never attributes historical order to current country agent", () => {
    const snap = mapOrderToTripFinancialSnapshot({
      documentId: "ord_no_snap",
      data: {
        status: "completed",
        currency: "SAR",
        total_mndob2: 50,
        total: 50,
        total_app: 7.5,
        total_vat: 0,
        total_mndob: 42.5,
        PaymentMethod: "Cash",
        payment_status: "cash_collected",
      },
      currentCountryAgentId: "agent_live_now",
    });
    expect(snap.agent.status).toBe("unknown_historical");
    expect(snap.agent.agentId).toBeNull();
  });

  it("maps V2 settlement doc with partyType default driver", () => {
    const mapped = mapFinancialSettlementDoc(FIXTURE_V2_SETTLEMENT);
    expect(mapped.status).toBe("locked");
    expect(mapped.partyType).toBe("driver");
    expect(mapped.amountMinor).toBe(3000n);
    expect(mapped.productionApproved).toBe(false);

    const noParty = mapFinancialSettlementDoc({
      documentId: "set_legacy",
      data: {
        status: "draft",
        party_id: "drv_x",
        currency: "SAR",
        amount_minor: 100,
      },
    });
    expect(noParty.partyType).toBe("driver");

    const shadow = adapter.shadowSettlement(FIXTURE_V2_SETTLEMENT);
    expect(shadow.productionWrites).toBe(0);
    expect(shadow.settlement.status).toBe("locked");
  });

  it("known zero VAT remains available zero (missing ≠ known_zero)", () => {
    const snap = mapOrderToTripFinancialSnapshot({
      documentId: "ord_zero_vat",
      data: {
        status: "completed",
        currency: "SAR",
        total_mndob2: 50,
        total: 50,
        total_app: 7.5,
        total_vat: 0,
        total_mndob: 42.5,
        PaymentMethod: "Cash",
        payment_status: "cash_collected",
        driver_id: "d1",
      },
    });
    expect(snap.majors.vatAmount.availability).toBe("available");
    expect(snap.majors.vatAmount.amountMinor).toBe(0n);
  });

  it("conflicting legacy: does not re-rate platform commission from 15%", () => {
    const shadow = adapter.shadowTrip({
      documentId: "ord_rate",
      data: {
        ...FIXTURE_CASH_ORDER.data,
        total_app: 12, // historical amount
        // no approved rate field — must not invent 15
      },
    });
    expect(shadow.trip.platformCommissionMinor).toBe("1200");
    expect(shadow.snapshot.majors.platformCommission.amountMinor).toBe(1200n);
  });
});
