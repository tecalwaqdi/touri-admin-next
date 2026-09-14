import type { EligibilityExclusion } from "@/domain/finance/SettlementEligibilityService";

export const SETTLEMENT_STATUSES = [
  "draft",
  "under_review",
  "rejected",
  "approved",
  "closed",
  "reversed",
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export type SettlementPartyType = "driver" | "agent";

export type SettlementSummary = {
  tripCount: number;
  grossFareMinor: string;
  platformCommissionMinor: string;
  agentCommissionMinor: string;
  driverEarningsMinor: string;
  vatAmountMinor: string;
  cashCollectedMinor: string;
  onlineCollectedMinor: string;
  currencyCode: string;
};

export type SettlementTimelineEvent = {
  atUtc: string;
  action: string;
  actorUserId: string;
  note?: string;
};

export type Settlement = {
  id: string;
  partyType: SettlementPartyType;
  partyId: string;
  countryId: string;
  currencyCode: string;
  periodFromUtc: string;
  periodToUtc: string;
  status: SettlementStatus;
  tripIds: string[];
  excluded: EligibilityExclusion[];
  summary: SettlementSummary;
  calculationPolicyId: string;
  calculationPolicyVersion: string;
  createdByUserId: string;
  submittedByUserId: string | null;
  approvedByUserId: string | null;
  rejectedByUserId: string | null;
  closedByUserId: string | null;
  reversedByUserId: string | null;
  rejectionReason: string | null;
  reversalReason: string | null;
  reversesSettlementId: string | null;
  reversedBySettlementId: string | null;
  idempotencyKey: string;
  correlationId: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  closedAtUtc: string | null;
  timeline: SettlementTimelineEvent[];
  journalEntryId: string | null;
  synthetic: true;
};
