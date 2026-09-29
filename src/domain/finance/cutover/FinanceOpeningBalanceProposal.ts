/**
 * Opening-balance proposals for finance cutover — DRY RUN only.
 * Only balances fully supported by authoritative certified records.
 * Incomplete / conflict / orphan NEVER become opening balances.
 */

import type { FinanceCutoverInventoryRow } from "@/domain/finance/cutover/FinanceCutoverClassification";

export type OpeningBalanceProposal = {
  partyType: "driver" | "agent";
  partyId: string;
  country: string;
  currency: string;
  /** Amount party owes company (company receivable). */
  openingReceivable: string;
  /** Amount company owes party (company payable). */
  openingPayable: string;
  sourceReferences: string[];
  cutoverDate: string;
  supported: true;
};

export type UnresolvedHistoricalBalance = {
  partyType: "driver" | "agent" | null;
  partyId: string | null;
  country: string | null;
  currency: string | null;
  reason: string;
  sourceReferences: string[];
  recordIds: string[];
};

function addMinor(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

/**
 * Build opening-balance proposals from classified pre-cutover settlement rows.
 * REAL_UNPAID with full amount+paid → opening receivable/payable by direction.
 * All other historical classes → unresolved.
 */
export function proposeOpeningBalances(input: {
  rows: readonly FinanceCutoverInventoryRow[];
  cutoverDateUtc: string;
}): {
  proposals: OpeningBalanceProposal[];
  unresolved: UnresolvedHistoricalBalance[];
  driverOpeningBalances: OpeningBalanceProposal[];
  agentOpeningBalances: OpeningBalanceProposal[];
  companyNetOpening: {
    totalReceivable: string;
    totalPayable: string;
    currencyMixed: boolean;
  };
} {
  const proposalsByKey = new Map<string, OpeningBalanceProposal>();
  const unresolved: UnresolvedHistoricalBalance[] = [];

  for (const row of input.rows) {
    if (!row.preCutover) continue;
    if (row.kind !== "settlement" && row.kind !== "legacy_fin_set") continue;

    if (
      (row.class === "REAL_CERTIFIED" || row.class === "REAL_UNPAID") &&
      row.partyType &&
      row.partyId &&
      row.countryId &&
      row.currency &&
      row.outstandingMinor != null &&
      row.amountMinor != null &&
      row.paidConfirmedMinor != null
    ) {
      let outstanding: bigint;
      try {
        outstanding = BigInt(row.outstandingMinor);
      } catch {
        unresolved.push({
          partyType: row.partyType,
          partyId: row.partyId,
          country: row.countryId,
          currency: row.currency,
          reason: "outstanding_not_parseable",
          sourceReferences: row.sourceReferences,
          recordIds: [row.id],
        });
        continue;
      }
      if (outstanding === 0n) {
        // Fully paid certified — no opening carry-forward
        continue;
      }

      const key = `${row.partyType}|${row.partyId}|${row.countryId}|${row.currency}`;
      const abs = outstanding < 0n ? -outstanding : outstanding;
      const dir = (row.direction || "").toUpperCase();
      let openingReceivable = "0";
      let openingPayable = "0";
      if (dir.includes("COMPANY_PAYS")) {
        openingPayable = abs.toString();
      } else if (dir.includes("DRIVER_PAYS") || dir.includes("AGENT_PAYS")) {
        openingReceivable = abs.toString();
      } else {
        // Direction unknown — do not fabricate; mark unresolved
        unresolved.push({
          partyType: row.partyType,
          partyId: row.partyId,
          country: row.countryId,
          currency: row.currency,
          reason: "settlement_direction_unknown_for_opening",
          sourceReferences: row.sourceReferences,
          recordIds: [row.id],
        });
        continue;
      }

      const existing = proposalsByKey.get(key);
      if (!existing) {
        proposalsByKey.set(key, {
          partyType: row.partyType,
          partyId: row.partyId,
          country: row.countryId,
          currency: row.currency,
          openingReceivable,
          openingPayable,
          sourceReferences: [`settlement:${row.id}`, ...row.sourceReferences],
          cutoverDate: input.cutoverDateUtc,
          supported: true,
        });
      } else {
        existing.openingReceivable = addMinor(
          existing.openingReceivable,
          openingReceivable,
        );
        existing.openingPayable = addMinor(
          existing.openingPayable,
          openingPayable,
        );
        existing.sourceReferences.push(`settlement:${row.id}`);
      }
      continue;
    }

    unresolved.push({
      partyType: row.partyType,
      partyId: row.partyId,
      country: row.countryId,
      currency: row.currency,
      reason: `not_eligible_for_opening:${row.class}`,
      sourceReferences: row.sourceReferences,
      recordIds: [row.id],
    });
  }

  const proposals = [...proposalsByKey.values()];
  const driverOpeningBalances = proposals.filter((p) => p.partyType === "driver");
  const agentOpeningBalances = proposals.filter((p) => p.partyType === "agent");

  const currencies = new Set(proposals.map((p) => p.currency));
  let totalReceivable = "0";
  let totalPayable = "0";
  for (const p of proposals) {
    totalReceivable = addMinor(totalReceivable, p.openingReceivable);
    totalPayable = addMinor(totalPayable, p.openingPayable);
  }

  return {
    proposals,
    unresolved,
    driverOpeningBalances,
    agentOpeningBalances,
    companyNetOpening: {
      totalReceivable,
      totalPayable,
      currencyMixed: currencies.size > 1,
    },
  };
}
