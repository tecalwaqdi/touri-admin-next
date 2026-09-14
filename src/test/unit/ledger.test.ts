import { describe, expect, it } from "vitest";
import { Money } from "@/domain/finance/Money";
import {
  ImmutableJournalError,
  UnbalancedJournalError,
  journalService,
  type JournalEntry,
} from "@/domain/ledger/Journal";

function draft(balanced: boolean): JournalEntry {
  return {
    entryId: "JE-1",
    status: "draft",
    currencyCode: "SAR",
    lines: balanced
      ? [
          {
            lineId: "L1",
            accountCode: "SYN-CASH",
            side: "debit",
            amount: Money.of(1000, "SAR"),
          },
          {
            lineId: "L2",
            accountCode: "SYN-PLATFORM-REVENUE",
            side: "credit",
            amount: Money.of(1000, "SAR"),
          },
        ]
      : [
          {
            lineId: "L1",
            accountCode: "SYN-CASH",
            side: "debit",
            amount: Money.of(1000, "SAR"),
          },
          {
            lineId: "L2",
            accountCode: "SYN-PLATFORM-REVENUE",
            side: "credit",
            amount: Money.of(900, "SAR"),
          },
        ],
    memo: "test",
    correlationId: "corr_1",
    createdAtUtc: "2026-09-01T00:00:00.000Z",
    postedAtUtc: null,
    reversedByEntryId: null,
    reversesEntryId: null,
    synthetic: true,
    productionLedger: false,
  };
}

describe("synthetic ledger", () => {
  it("rejects unbalanced journals", () => {
    expect(() => journalService.assertBalanced(draft(false))).toThrow(
      UnbalancedJournalError,
    );
  });

  it("posts balanced journals and blocks mutation", () => {
    const posted = journalService.post(draft(true), "2026-09-01T01:00:00.000Z");
    expect(posted.status).toBe("posted");
    expect(() => journalService.assertMutable(posted)).toThrow(ImmutableJournalError);
  });

  it("creates reversing entries", () => {
    const posted = journalService.post(draft(true));
    const reversal = journalService.createReversal(posted, {
      entryId: "JE-REV-1",
      correlationId: "corr_rev",
      createdAtUtc: "2026-09-02T00:00:00.000Z",
    });
    expect(reversal.status).toBe("posted");
    expect(reversal.reversesEntryId).toBe("JE-1");
    expect(reversal.lines[0]?.side).toBe("credit");
  });
});
