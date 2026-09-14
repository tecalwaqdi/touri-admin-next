/**
 * FR1 pilot — exact finance snapshot calculation from persisted majors + FC-01 rate.
 * Historical amounts remain authoritative; rate comes from approved versioned policy.
 * Money precision: integer minor units; percent half-up (locked Finance design).
 */

import { mapOrderToTripFinancialSnapshot } from "@/adapters/finance/ProductionFinanceReadAdapter";
import { buildDriverAccountingLine } from "@/domain/finance/v2/AccountingLine";
import { percentOfMinorHalfUp } from "@/domain/finance/v2/CalculationPipeline";
import type { SettlementDirection } from "@/domain/finance/v2/FinanceImplementationContracts";
import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT,
  requireFc01ApprovedPlatformCommissionRate,
} from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  resolveDiscountAccounting,
  type DiscountFundingOwner,
} from "@/domain/finance/v2/policies/DiscountTreatmentPolicyF6";
import { settlementDirectionForTrip } from "@/domain/settlement/v2/SettlementDirections";
import type { FinanceFr1CandidateOrder } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import { classifyFinanceFr1Trip } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import {
  FINANCE_FR1_EXPECTED_WRITE_COUNTS,
  FINANCE_FR1_PILOT_CLIENT_KEY,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";

export type FinanceFr1CalculatedSnapshot = {
  orderId: string;
  classification: ReturnType<typeof classifyFinanceFr1Trip>;
  currency: string;
  countryId: string | null;
  driverId: string | null;
  paymentMethod: "cash" | "card" | "unknown";
  paymentStatus: string;
  lifecycleCompleted: boolean;
  grossFareMinor: string | null;
  discountMinor: string | null;
  discountFundingOwner: DiscountFundingOwner | null;
  discountPolicyBlocked: boolean;
  eligibleRevenueMinor: string | null;
  commissionRatePercent: number;
  commissionPolicyId: string;
  commissionPolicyVersion: string;
  /** Persisted historical commission amount (authoritative). */
  commissionAmountPersistedMinor: string | null;
  /**
   * Diagnostic only — policy % applied to gross for NEW-calc verification.
   * Must NOT rewrite historical total_app.
   */
  commissionAmountFromApprovedRateMinor: string | null;
  vatAmountMinor: string | null;
  driverGrossMinor: string | null;
  driverDeductionsMinor: string | null;
  driverNetMinor: string | null;
  agentAttributionStatus: string;
  agentId: string | null;
  agentShareMinor: string | null;
  companyAllocationMinor: string | null;
  settlementDirection: SettlementDirection | null;
  reconciliationStatus: "preconditions_ok" | "preconditions_blocked";
  reconciliationBlockers: string[];
  idempotencyKeyPattern: string;
  expectedWrites: typeof FINANCE_FR1_EXPECTED_WRITE_COUNTS;
  mutatesOrderMajors: false;
  historicalReRateForbidden: true;
};

function minorToString(v: bigint | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v.toString();
}

export function calculateFinanceFr1PilotSnapshot(input: {
  order: FinanceFr1CandidateOrder;
  actorUserId: string;
  discountFundingOwner?: DiscountFundingOwner | null;
  asOfUtc?: string;
}): FinanceFr1CalculatedSnapshot {
  const classification = classifyFinanceFr1Trip(input.order);
  const snap = mapOrderToTripFinancialSnapshot({
    documentId: input.order.documentId,
    data: input.order.data,
  });

  const commissionRatePercent = requireFc01ApprovedPlatformCommissionRate({
    asOfUtc: input.asOfUtc,
  });

  const gross = snap.majors.grossFare.amountMinor;
  const customer = snap.majors.customerTotal.amountMinor;
  const discount = resolveDiscountAccounting({
    currency: snap.majors.currency || "XXX",
    grossFareMinor: gross,
    customerTotalMinor: customer,
    fundingOwner: input.discountFundingOwner ?? null,
  });

  // Eligible revenue for pilot exposure = customer payable when available,
  // else gross when no discount represented — never invent 0.
  let eligibleRevenueMinor: bigint | null = null;
  if (customer != null) {
    eligibleRevenueMinor = customer;
  } else if (gross != null && discount.availability === "not_represented") {
    eligibleRevenueMinor = gross;
  }

  let commissionFromRate: bigint | null = null;
  if (gross != null) {
    commissionFromRate = percentOfMinorHalfUp(gross, commissionRatePercent);
  }

  const blockers: string[] = [];
  if (!snap.majors.lifecycleCompleted) blockers.push("trip_not_completed");
  if (!snap.majors.currency?.trim()) blockers.push("currency_missing");
  if (gross == null) blockers.push("gross_fare_missing");
  if (snap.majors.driverNet.amountMinor == null) {
    blockers.push("driver_net_missing");
  }
  if (snap.majors.platformCommission.amountMinor == null) {
    blockers.push("platform_commission_persisted_missing");
  }
  if (snap.majors.vatAmount.amountMinor == null) {
    blockers.push("vat_missing");
  }
  if (snap.majors.paymentChannel === "unknown") {
    blockers.push("payment_channel_unknown");
  }
  if (discount.policyBlocked && discount.availability === "available") {
    blockers.push("discount_funding_owner_required");
  }

  let settlementDirection: SettlementDirection | null = null;
  try {
    if (snap.majors.paymentChannel !== "unknown") {
      settlementDirection = settlementDirectionForTrip(
        snap.majors.paymentChannel,
      );
    }
  } catch {
    blockers.push("settlement_direction_unresolved");
  }

  const driverLine = buildDriverAccountingLine(
    snap,
    snap.driverId ?? "unknown_driver",
  );
  if (!driverLine.eligibility.eligible) {
    blockers.push(
      `driver_line_ineligible:${driverLine.eligibility.exclusionReason ?? "unknown"}`,
    );
  }

  const idempotencyKeyPattern = buildFinanceIdempotencyKey({
    actorUid: input.actorUserId,
    op: "snapshot.materialize",
    resourceType: "order",
    resourceId: input.order.documentId,
    clientKey: FINANCE_FR1_PILOT_CLIENT_KEY,
  });

  return {
    orderId: input.order.documentId,
    classification,
    currency: snap.majors.currency,
    countryId: snap.countryId,
    driverId: snap.driverId,
    paymentMethod: snap.majors.paymentChannel,
    paymentStatus: snap.majors.paymentStatus,
    lifecycleCompleted: snap.majors.lifecycleCompleted,
    grossFareMinor: minorToString(gross),
    discountMinor: minorToString(discount.amountMinor),
    discountFundingOwner: discount.fundingOwner,
    discountPolicyBlocked: discount.policyBlocked,
    eligibleRevenueMinor: minorToString(eligibleRevenueMinor),
    commissionRatePercent,
    commissionPolicyId: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.policyId,
    commissionPolicyVersion:
      PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version,
    commissionAmountPersistedMinor: minorToString(
      snap.majors.platformCommission.amountMinor,
    ),
    commissionAmountFromApprovedRateMinor: minorToString(commissionFromRate),
    vatAmountMinor: minorToString(snap.majors.vatAmount.amountMinor),
    driverGrossMinor: minorToString(gross),
    driverDeductionsMinor: minorToString(snap.driverDeductions.amountMinor),
    driverNetMinor: minorToString(snap.majors.driverNet.amountMinor),
    agentAttributionStatus: snap.agent.status,
    agentId: snap.agent.agentId,
    agentShareMinor: minorToString(snap.agent.amountMinor),
    companyAllocationMinor: minorToString(snap.companyPlatformNet.amountMinor),
    settlementDirection,
    reconciliationStatus:
      blockers.length === 0 ? "preconditions_ok" : "preconditions_blocked",
    reconciliationBlockers: blockers,
    idempotencyKeyPattern,
    expectedWrites: FINANCE_FR1_EXPECTED_WRITE_COUNTS,
    mutatesOrderMajors: false,
    historicalReRateForbidden: true,
  };
}
