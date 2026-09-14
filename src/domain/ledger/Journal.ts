import { Money } from "@/domain/finance/Money";
import type { SyntheticAccountCode } from "@/domain/ledger/ChartOfAccounts";
import { SYNTHETIC_COA } from "@/domain/ledger/ChartOfAccounts";

export type JournalLineSide = "debit" | "credit";

export type JournalLine = {
  lineId: string;
  accountCode: SyntheticAccountCode;
  side: JournalLineSide;
  amount: Money;
  memo?: string;
};

export type JournalEntryStatus = "draft" | "posted" | "reversed";

export type JournalEntry = {
  entryId: string;
  status: JournalEntryStatus;
  currencyCode: string;
  lines: JournalLine[];
  memo: string;
  correlationId: string;
  createdAtUtc: string;
  postedAtUtc: string | null;
  reversedByEntryId: string | null;
  reversesEntryId: string | null;
  synthetic: true;
  productionLedger: false;
};

export class UnbalancedJournalError extends Error {
  readonly code = "UNBALANCED_JOURNAL";
  constructor(debit: string, credit: string) {
    super(`Journal unbalanced: debit=${debit} credit=${credit}`);
    this.name = "UnbalancedJournalError";
  }
}

export class ImmutableJournalError extends Error {
  readonly code = "IMMUTABLE_JOURNAL";
  constructor(message: string) {
    super(message);
    this.name = "ImmutableJournalError";
  }
}

export class JournalService {
  assertBalanced(entry: Pick<JournalEntry, "lines" | "currencyCode">): void {
    if (entry.lines.length < 2) {
      throw new UnbalancedJournalError("0", "0");
    }
    let debit = Money.zero(entry.currencyCode);
    let credit = Money.zero(entry.currencyCode);
    for (const line of entry.lines) {
      if (!(line.accountCode in SYNTHETIC_COA)) {
        throw new Error(`Unknown synthetic account: ${line.accountCode}`);
      }
      if (line.amount.currency !== entry.currencyCode) {
        throw new Error("Line currency must match journal currency");
      }
      if (line.side === "debit") debit = debit.add(line.amount);
      else credit = credit.add(line.amount);
    }
    if (!debit.equals(credit)) {
      throw new UnbalancedJournalError(
        debit.amountMinor.toString(),
        credit.amountMinor.toString(),
      );
    }
  }

  post(entry: JournalEntry, postedAtUtc = new Date().toISOString()): JournalEntry {
    if (entry.status === "posted") {
      throw new ImmutableJournalError("Entry already posted");
    }
    if (entry.status === "reversed") {
      throw new ImmutableJournalError("Cannot post a reversed entry");
    }
    this.assertBalanced(entry);
    return {
      ...entry,
      status: "posted",
      postedAtUtc,
      synthetic: true,
      productionLedger: false,
    };
  }

  /** Posted entries are immutable — corrections via reversal only. */
  assertMutable(entry: JournalEntry): void {
    if (entry.status === "posted" || entry.status === "reversed") {
      throw new ImmutableJournalError("Posted journal entries cannot be edited or deleted");
    }
  }

  createReversal(
    original: JournalEntry,
    input: { entryId: string; correlationId: string; createdAtUtc: string },
  ): JournalEntry {
    if (original.status !== "posted") {
      throw new Error("Only posted entries can be reversed");
    }
    if (original.reversedByEntryId) {
      throw new ImmutableJournalError("Entry already reversed");
    }
    const lines: JournalLine[] = original.lines.map((line, idx) => ({
      lineId: `${input.entryId}-L${idx + 1}`,
      accountCode: line.accountCode,
      side: line.side === "debit" ? "credit" : "debit",
      amount: Money.of(line.amount.amountMinor, line.amount.currency),
      memo: `Reversal of ${original.entryId}`,
    }));
    const reversal: JournalEntry = {
      entryId: input.entryId,
      status: "draft",
      currencyCode: original.currencyCode,
      lines,
      memo: `Reversal of ${original.entryId}`,
      correlationId: input.correlationId,
      createdAtUtc: input.createdAtUtc,
      postedAtUtc: null,
      reversedByEntryId: null,
      reversesEntryId: original.entryId,
      synthetic: true,
      productionLedger: false,
    };
    return this.post(reversal, input.createdAtUtc);
  }
}

export const journalService = new JournalService();
