import type { JournalEntry } from "@/domain/ledger/Journal";

export interface LedgerRepository {
  getById(entryId: string): Promise<JournalEntry | null>;
  save(entry: JournalEntry): Promise<JournalEntry>;
  list(limit?: number): Promise<JournalEntry[]>;
}
