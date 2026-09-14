import type { JournalEntry } from "@/domain/ledger/Journal";
import type { LedgerRepository } from "@/repositories/interfaces/LedgerRepository";
import { Money } from "@/domain/finance/Money";

const seedJournal: JournalEntry = {
  entryId: "JE-SET-EG-001",
  status: "posted",
  currencyCode: "EGP",
  lines: [
    {
      lineId: "JE-SET-EG-001-L1",
      accountCode: "SYN-SETTLEMENT-CLEARING",
      side: "debit",
      amount: Money.of(9600, "EGP"),
      memo: "Driver earnings",
    },
    {
      lineId: "JE-SET-EG-001-L2",
      accountCode: "SYN-DRIVER-PAYABLE",
      side: "credit",
      amount: Money.of(9600, "EGP"),
      memo: "Driver payable",
    },
  ],
  memo: "Close SET-EG-001",
  correlationId: "corr_seed_set_eg_001",
  createdAtUtc: "2026-09-04T14:00:00.000Z",
  postedAtUtc: "2026-09-04T14:00:00.000Z",
  reversedByEntryId: null,
  reversesEntryId: null,
  synthetic: true,
  productionLedger: false,
};

export class InMemoryLedgerRepository implements LedgerRepository {
  private entries: JournalEntry[];

  constructor(initial: JournalEntry[] = [structuredClone(seedJournal)]) {
    this.entries = initial;
  }

  async getById(entryId: string) {
    return this.entries.find((e) => e.entryId === entryId) ?? null;
  }

  async save(entry: JournalEntry) {
    const idx = this.entries.findIndex((e) => e.entryId === entry.entryId);
    if (idx >= 0) this.entries[idx] = entry;
    else this.entries.unshift(entry);
    return entry;
  }

  async list(limit = 100) {
    return this.entries.slice(0, limit);
  }
}
