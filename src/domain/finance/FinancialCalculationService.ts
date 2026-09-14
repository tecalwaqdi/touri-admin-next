import { Money } from "@/domain/finance/Money";
import type {
  FinancialConfidence,
  FinancialTrip,
  IncompleteFinancialReason,
} from "@/domain/finance/FinancialTrip";
import {
  SYNTHETIC_POLICY_ID,
  SYNTHETIC_POLICY_VERSION,
  syntheticFinancialPolicyProvider,
  type SyntheticFinancialPolicy,
} from "@/domain/finance/SyntheticFinancialPolicy";
import type { Trip } from "@/types/trip";

function bpsOf(amount: Money, bps: number): Money {
  // Round half-up on absolute value in minor units.
  const raw = amount.amountMinor * BigInt(bps);
  const basis = BigInt(10000);
  const half = BigInt(5000);
  const q = raw / basis;
  const r = raw % basis;
  const adj =
    r >= half || r <= -half ? (raw < BigInt(0) ? BigInt(-1) : BigInt(1)) : BigInt(0);
  return Money.of(q + adj, amount.currency);
}

function majorToMinor(major: number | null, currency: string): Money | null {
  if (major === null || Number.isNaN(major)) return null;
  return Money.of(Math.round(major * 100), currency);
}

/**
 * SYNTHETIC Phase 2 finance only — SEPARATE from Canonical historical read rules (Phase 3.6).
 * All rates come from FinancialPolicyProvider / SyntheticFinancialPolicyProvider.
 * NEVER hardcode 0.15 / 15 / 1500 in this service body — use policy.*Bps only.
 * UI must never hard-code VAT/commission formulas.
 * Do NOT use this service to recalculate historical Legacy trips.
 */
export class FinancialCalculationService {
  constructor(
    private readonly policyProvider = syntheticFinancialPolicyProvider,
  ) {}

  getPolicy(): SyntheticFinancialPolicy {
    return this.policyProvider.getPolicy();
  }

  calculateFromTrip(trip: Trip, alreadySettledInId: string | null = null): FinancialTrip {
    const policy = this.getPolicy();
    this.policyProvider.assertNonProduction();

    // Rates only from policy provider — never literal 0.15/15/1500 here.
    const platformCommissionBps = policy.platformCommissionBps;
    const agentCommissionBps = policy.agentCommissionBps;
    const vatBps = policy.vatBps;
    const gatewayFeeBps = policy.gatewayFeeBps;

    const incompleteReasons: IncompleteFinancialReason[] = [];
    const currency = trip.currencyCode?.toUpperCase() ?? "";

    if (!currency) incompleteReasons.push("MISSING_CURRENCY");
    if (!trip.driverId) incompleteReasons.push("MISSING_DRIVER");
    if (!trip.agentId) incompleteReasons.push("MISSING_AGENT");

    if (trip.status !== "completed" && trip.status !== "under_dispute" && trip.status !== "refunded") {
      incompleteReasons.push("NOT_COMPLETED");
    }
    if (trip.status === "under_dispute") incompleteReasons.push("UNDER_DISPUTE");
    if (trip.status === "refunded") incompleteReasons.push("REFUND_PENDING");

    const grossFare = currency ? majorToMinor(trip.grossFare, currency) : null;
    const cashCollected = currency ? majorToMinor(trip.cashCollected, currency) : null;
    const onlineCollected = currency ? majorToMinor(trip.onlineCollected, currency) : null;

    if (!grossFare) incompleteReasons.push("MISSING_GROSS_FARE");
    if (
      trip.status === "completed" &&
      grossFare &&
      cashCollected === null &&
      onlineCollected === null
    ) {
      incompleteReasons.push("MISSING_PAYMENT_SPLIT");
    }

    let confidence: FinancialConfidence = "high";
    let platformCommission: Money | null = null;
    let agentCommission: Money | null = null;
    let driverEarnings: Money | null = null;
    let vatAmount: Money | null = null;
    let gatewayFee: Money | null = null;
    let refundAmount: Money | null = null;

    if (incompleteReasons.includes("UNDER_DISPUTE")) {
      confidence = "disputed";
    } else if (
      incompleteReasons.some((r) =>
        [
          "MISSING_GROSS_FARE",
          "MISSING_PAYMENT_SPLIT",
          "MISSING_CURRENCY",
          "NOT_COMPLETED",
          "REFUND_PENDING",
          "MISSING_DRIVER",
        ].includes(r),
      )
    ) {
      confidence = "incomplete";
    } else if (incompleteReasons.includes("DERIVED_FROM_PARTIAL_DATA") || trip.legacyStatus === "derived") {
      confidence = "derived";
      incompleteReasons.push("DERIVED_FROM_PARTIAL_DATA");
    }

    if (grossFare && confidence !== "incomplete") {
      platformCommission = bpsOf(grossFare, platformCommissionBps);
      agentCommission = bpsOf(grossFare, agentCommissionBps);
      vatAmount = bpsOf(grossFare, vatBps);
      gatewayFee =
        trip.paymentMethod === "cash"
          ? Money.zero(grossFare.currency)
          : bpsOf(grossFare, gatewayFeeBps);
      driverEarnings = grossFare.subtract(platformCommission).subtract(agentCommission);
      if (trip.status === "refunded") {
        refundAmount = grossFare;
        confidence = "incomplete";
        if (!incompleteReasons.includes("REFUND_PENDING")) {
          incompleteReasons.push("REFUND_PENDING");
        }
      }
    } else if (grossFare && confidence === "derived") {
      platformCommission = bpsOf(grossFare, platformCommissionBps);
      agentCommission = bpsOf(grossFare, agentCommissionBps);
      vatAmount = bpsOf(grossFare, vatBps);
      gatewayFee = Money.zero(grossFare.currency);
      driverEarnings = grossFare.subtract(platformCommission).subtract(agentCommission);
    }

    // Incomplete ≠ treat as zero — leave calculated fields null when incomplete.
    if (confidence === "incomplete") {
      platformCommission = null;
      agentCommission = null;
      driverEarnings = null;
      vatAmount = null;
      gatewayFee = null;
    }

    const settlementEligible =
      trip.status === "completed" &&
      confidence === "high" &&
      !alreadySettledInId &&
      Boolean(trip.driverId) &&
      Boolean(trip.agentId) &&
      Boolean(grossFare);

    return {
      financialTripId: `FT-${trip.id}`,
      tripId: trip.id,
      status: trip.status,
      paymentMethod: trip.paymentMethod,
      currencyCode: currency || "XXX",
      parties: {
        customerId: trip.customerId,
        driverId: trip.driverId,
        agentId: trip.agentId,
        countryId: trip.countryId,
        cityId: trip.cityId,
      },
      amounts: {
        grossFare,
        cashCollected,
        onlineCollected,
        platformCommission,
        agentCommission,
        driverEarnings,
        vatAmount,
        refundAmount,
        gatewayFee,
      },
      confidence,
      incompleteReasons: [...new Set(incompleteReasons)],
      calculationPolicyId: SYNTHETIC_POLICY_ID,
      calculationPolicyVersion: SYNTHETIC_POLICY_VERSION,
      calculatedAtUtc: "2026-09-11T00:00:00.000Z",
      settlementEligible,
      alreadySettledInId,
      synthetic: true,
    };
  }
}

export const financialCalculationService = new FinancialCalculationService();
