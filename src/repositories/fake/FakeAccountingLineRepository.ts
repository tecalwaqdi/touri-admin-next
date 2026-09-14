import type { AccountingLine } from "@/domain/finance/v2/AccountingLine";
import type { AccountingLineRepository } from "@/repositories/interfaces/AccountingLineRepository";

export class FakeAccountingLineRepository implements AccountingLineRepository {
  private readonly lines = new Map<string, AccountingLine>();

  async put(line: AccountingLine): Promise<void> {
    this.lines.set(line.lineId, { ...line });
  }

  async listByOrder(orderId: string): Promise<AccountingLine[]> {
    return [...this.lines.values()].filter((l) => l.orderId === orderId);
  }

  async listEligible(filter: {
    partyType: "driver" | "agent";
    partyId: string;
    currency: string;
  }): Promise<AccountingLine[]> {
    return [...this.lines.values()].filter(
      (l) =>
        l.eligibility.eligible &&
        l.partyType === filter.partyType &&
        l.partyId === filter.partyId &&
        l.currency === filter.currency &&
        l.amount.amountMinor != null,
    );
  }
}
