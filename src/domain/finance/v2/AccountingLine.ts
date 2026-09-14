/**
 * Settlement V2 accounting line contract (offline).
 * Eligible lines only enter settlement cycles.
 */

import type {
  AccountingLineEligibility,
  AvailableMoney,
  SettlementDirection,
  SettlementPartyType,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import type { TripFinancialSnapshot } from "@/domain/finance/v2/TripFinancialSnapshot";
import { preferPersistedDriverNet } from "@/domain/finance/v2/TripFinancialSnapshot";
import { settlementDirectionForTrip } from "@/domain/settlement/v2/SettlementDirections";

export type AccountingLine = {
  lineId: string;
  orderId: string;
  partyType: SettlementPartyType;
  partyId: string | null;
  currency: string;
  direction: SettlementDirection;
  amount: AvailableMoney;
  eligibility: AccountingLineEligibility;
  paymentChannel: "cash" | "card" | "unknown";
  provenance: "persisted_majors" | "agent_snapshot";
};

function requireCompletedCollected(snapshot: TripFinancialSnapshot): string | null {
  if (!snapshot.majors.lifecycleCompleted) return "not_completed";
  const m = snapshot.majors;
  if (m.grossFare.availability !== "available" || m.grossFare.amountMinor == null) {
    return "missing_gross_fare";
  }
  if (m.driverNet.availability !== "available" || m.driverNet.amountMinor == null) {
    return "missing_driver_net_persisted";
  }
  if (m.platformCommission.availability !== "available") {
    return "missing_platform_commission";
  }
  if (m.vatAmount.availability !== "available") {
    return "missing_vat";
  }
  if (m.paymentChannel === "unknown") return "unknown_payment_channel";
  const status = m.paymentStatus.toLowerCase();
  if (
    m.paymentChannel === "cash" &&
    status !== "cash_collected" &&
    status !== "paid"
  ) {
    return "cash_not_collected";
  }
  if (
    m.paymentChannel === "card" &&
    status !== "paid" &&
    status !== "captured"
  ) {
    return "card_not_captured";
  }
  return null;
}

/**
 * Driver settlement line from trip snapshot (cash remittance or online payable).
 * Amount = company exposure / driver net position per channel — uses persisted majors only.
 */
export function buildDriverAccountingLine(
  snapshot: TripFinancialSnapshot,
  driverId: string,
): AccountingLine {
  const exclusion = requireCompletedCollected(snapshot);
  const driverNet = preferPersistedDriverNet(snapshot);
  const direction = settlementDirectionForTrip(snapshot.majors.paymentChannel);

  let amount: AvailableMoney;
  if (exclusion) {
    amount = {
      amountMinor: null,
      currency: snapshot.majors.currency,
      availability: "incomplete",
      reason: exclusion,
    };
  } else if (snapshot.majors.paymentChannel === "cash") {
    // Driver holds cash; company exposure = cashHeld − driverNet ≈ platform + VAT
    // when majors complete (gross − driverNet).
    const gross = snapshot.majors.grossFare.amountMinor!;
    const net = driverNet.amountMinor!;
    amount = {
      amountMinor: gross - net,
      currency: snapshot.majors.currency,
      availability: "available",
    };
  } else {
    // Card: company holds; company pays driver net.
    amount = driverNet;
  }

  return {
    lineId: `drv_line_${snapshot.majors.orderId}`,
    orderId: snapshot.majors.orderId,
    partyType: "driver",
    partyId: driverId,
    currency: snapshot.majors.currency,
    direction,
    amount,
    eligibility: exclusion
      ? { eligible: false, exclusionReason: exclusion }
      : amount.availability === "available"
        ? { eligible: true }
        : { eligible: false, exclusionReason: amount.reason ?? "incomplete" },
    paymentChannel: snapshot.majors.paymentChannel,
    provenance: "persisted_majors",
  };
}

/** Agent commission line — requires snapshot amount; never invents current agent. */
export function buildAgentAccountingLine(
  snapshot: TripFinancialSnapshot,
): AccountingLine {
  const currency = snapshot.majors.currency;
  if (snapshot.agent.status !== "snapshot" || snapshot.agent.amountMinor == null) {
    return {
      lineId: `agt_line_${snapshot.majors.orderId}`,
      orderId: snapshot.majors.orderId,
      partyType: "agent",
      partyId: null,
      currency,
      direction: "COMPANY_PAYS_AGENT",
      amount: {
        amountMinor: null,
        currency,
        availability: "incomplete",
        reason: "agent_snapshot_missing",
      },
      eligibility: {
        eligible: false,
        exclusionReason: "agent_snapshot_missing",
      },
      paymentChannel: snapshot.majors.paymentChannel,
      provenance: "agent_snapshot",
    };
  }

  const completedOk = snapshot.majors.lifecycleCompleted;
  return {
    lineId: `agt_line_${snapshot.majors.orderId}`,
    orderId: snapshot.majors.orderId,
    partyType: "agent",
    partyId: snapshot.agent.agentId,
    currency,
    direction: "COMPANY_PAYS_AGENT",
    amount: {
      amountMinor: snapshot.agent.amountMinor,
      currency,
      availability: "available",
    },
    eligibility: completedOk
      ? { eligible: true }
      : { eligible: false, exclusionReason: "not_completed" },
    paymentChannel: snapshot.majors.paymentChannel,
    provenance: "agent_snapshot",
  };
}
