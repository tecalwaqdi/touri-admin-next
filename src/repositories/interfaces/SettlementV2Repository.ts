import type { SettlementV2 } from "@/domain/settlement/v2/SettlementV2";
import type { SettlementPayment } from "@/domain/settlement/v2/SettlementPayment";
import type {
  SettlementDirection,
  SettlementPartyType,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import type { SettlementV2LineClaim } from "@/domain/settlement/v2/SettlementV2";

export type CreateSettlementDraftInput = {
  partyType: SettlementPartyType;
  partyId: string;
  countryId: string;
  currency: string;
  direction: SettlementDirection;
  claims: SettlementV2LineClaim[];
  periodFromUtc: string;
  periodToUtc: string;
  createdByUserId: string;
  clientKey: string;
  correlationId: string;
  dueAtUtc?: string | null;
};

export interface SettlementV2Repository {
  createDraft(input: CreateSettlementDraftInput): Promise<SettlementV2>;
  lock(input: {
    settlementId: string;
    approverUserId: string;
    clientKey: string;
  }): Promise<SettlementV2>;
  void(input: {
    settlementId: string;
    actorUserId: string;
    reason: string;
  }): Promise<SettlementV2>;
  createPayment(input: {
    settlementId: string;
    amountMinor: bigint;
    createdByUserId: string;
    clientKey: string;
  }): Promise<SettlementPayment>;
  confirmPayment(input: {
    paymentId: string;
    actorUserId: string;
    clientKey: string;
  }): Promise<{ payment: SettlementPayment; settlement: SettlementV2 }>;
  reversePayment(input: {
    paymentId: string;
    actorUserId: string;
    reason: string;
    clientKey: string;
  }): Promise<{ payment: SettlementPayment; settlement: SettlementV2 }>;
  get(id: string): Promise<SettlementV2 | null>;
  getPayment(id: string): Promise<SettlementPayment | null>;
}
