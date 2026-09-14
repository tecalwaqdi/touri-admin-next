import type { Money } from "@/domain/finance/Money";
import type { CanonicalTripStatus, PaymentMethod } from "@/types/trip";

export type FinancialConfidence = "high" | "derived" | "incomplete" | "disputed";

export type IncompleteFinancialReason =
  | "MISSING_GROSS_FARE"
  | "MISSING_PAYMENT_SPLIT"
  | "MISSING_DRIVER"
  | "MISSING_AGENT"
  | "MISSING_CURRENCY"
  | "REFUND_PENDING"
  | "UNDER_DISPUTE"
  | "NOT_COMPLETED"
  | "POLICY_UNAVAILABLE"
  | "DERIVED_FROM_PARTIAL_DATA";

export type FinancialTripParties = {
  customerId: string | null;
  driverId: string | null;
  agentId: string | null;
  countryId: string;
  cityId: string;
};

export type FinancialTripAmounts = {
  grossFare: Money | null;
  cashCollected: Money | null;
  onlineCollected: Money | null;
  platformCommission: Money | null;
  agentCommission: Money | null;
  driverEarnings: Money | null;
  vatAmount: Money | null;
  refundAmount: Money | null;
  gatewayFee: Money | null;
};

export type FinancialTrip = {
  financialTripId: string;
  tripId: string;
  status: CanonicalTripStatus;
  paymentMethod: PaymentMethod;
  currencyCode: string;
  parties: FinancialTripParties;
  amounts: FinancialTripAmounts;
  confidence: FinancialConfidence;
  incompleteReasons: IncompleteFinancialReason[];
  calculationPolicyId: string;
  calculationPolicyVersion: string;
  calculatedAtUtc: string;
  settlementEligible: boolean;
  alreadySettledInId: string | null;
  synthetic: true;
};

export function moneySnapshot(money: Money | null): {
  amountMinor: string;
  currency: string;
} | null {
  if (!money) return null;
  return money.toJSON();
}
