import { describe, expect, it } from "vitest";
import { FinancialCalculationService } from "@/domain/finance/FinancialCalculationService";
import { settlementEligibilityService } from "@/domain/finance/SettlementEligibilityService";
import type { Trip } from "@/types/trip";
import { SYNTHETIC_POLICY_ID } from "@/domain/finance/SyntheticFinancialPolicy";

const baseTrip: Trip = {
  id: "TRIP-SA-001",
  customerId: "CUS-SA-001",
  customerName: "Customer",
  driverId: "DRV-SA-001",
  driverName: "Driver",
  agentId: "AGT-SA-001",
  countryId: "SA",
  cityId: "riyadh",
  status: "completed",
  paymentMethod: "cash",
  currencyCode: "SAR",
  grossFare: 100,
  cashCollected: 100,
  onlineCollected: 0,
  createdAtUtc: "2026-08-01T10:00:00.000Z",
  completedAtUtc: "2026-08-01T10:30:00.000Z",
};

describe("financial trip confidence and eligibility", () => {
  const calc = new FinancialCalculationService();

  it("marks complete trips high confidence with synthetic policy", () => {
    const ft = calc.calculateFromTrip(baseTrip);
    expect(ft.confidence).toBe("high");
    expect(ft.calculationPolicyId).toBe(SYNTHETIC_POLICY_ID);
    expect(ft.settlementEligible).toBe(true);
    expect(ft.amounts.platformCommission?.amountMinor).toBeGreaterThan(BigInt(0));
  });

  it("marks incomplete financial as incomplete not zero", () => {
    const ft = calc.calculateFromTrip({
      ...baseTrip,
      cashCollected: null,
      onlineCollected: null,
    });
    expect(ft.confidence).toBe("incomplete");
    expect(ft.amounts.platformCommission).toBeNull();
    expect(ft.incompleteReasons.length).toBeGreaterThan(0);
  });

  it("excludes ineligible trips with reason codes", () => {
    const high = calc.calculateFromTrip(baseTrip);
    const disputed = calc.calculateFromTrip({
      ...baseTrip,
      id: "TRIP-SA-DIS",
      status: "under_dispute",
    });
    const result = settlementEligibilityService.evaluate({
      financialTrips: [high, disputed],
      partyType: "agent",
      partyId: "AGT-SA-001",
      currencyCode: "SAR",
      periodFromUtc: "2026-08-01T00:00:00.000Z",
      periodToUtc: "2026-08-31T23:59:59.000Z",
      tripCompletedAtById: {
        "TRIP-SA-001": baseTrip.completedAtUtc,
        "TRIP-SA-DIS": baseTrip.completedAtUtc,
      },
    });
    expect(result.eligible.map((e) => e.tripId)).toContain("TRIP-SA-001");
    expect(result.excluded.some((e) => e.reasonCode === "DISPUTED")).toBe(true);
  });
});
