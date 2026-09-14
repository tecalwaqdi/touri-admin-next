import type { AccountingLine } from "@/domain/finance/v2/AccountingLine";

export interface AccountingLineRepository {
  put(line: AccountingLine): Promise<void>;
  listByOrder(orderId: string): Promise<AccountingLine[]>;
  listEligible(filter: {
    partyType: "driver" | "agent";
    partyId: string;
    currency: string;
  }): Promise<AccountingLine[]>;
}
