/**
 * Thin projection: certified cash snapshots → accountant cash-collection rows.
 * No new money formulas — displays SoT minors from ReportingSnapshotSource.
 */

import type {
  FinanceReportingDimensionFilters,
  FinanceReportingSourceBundle,
  ReportingSnapshotSource,
  ReportingSettlementSource,
} from "@/domain/finance/reporting/FinanceReportingTypes";

export type CashCollectionRow = {
  partyType: "driver" | "agent" | "unknown";
  partyId: string | null;
  countryId: string;
  currency: string;
  /** Gross fare from certified cash snapshot (expected). */
  expectedMinor: string | null;
  /** Same as expected when cash snap is certified collected — missing ≠ 0. */
  collectedMinor: string | null;
  /** Outstanding from linked party settlements when present. */
  outstandingMinor: string | null;
  lastCollectionUtc: string | null;
  status: "collected" | "outstanding" | "incomplete";
  snapshotIds: string[];
  tripCount: number;
};

function filterCashSnaps(
  snaps: ReportingSnapshotSource[],
  filters: FinanceReportingDimensionFilters,
): ReportingSnapshotSource[] {
  return snaps.filter((s) => {
    if (s.paymentMethod !== "cash") return false;
    if (!s.lifecycleCompleted) return false;
    if (filters.countryId && s.countryId !== filters.countryId) return false;
    if (filters.currency && s.currency.toUpperCase() !== filters.currency.toUpperCase())
      return false;
    if (filters.driverId && s.driverId !== filters.driverId) return false;
    if (filters.agentId && s.agentId !== filters.agentId) return false;
    if (filters.periodFromUtc && s.createdAtUtc && s.createdAtUtc < filters.periodFromUtc)
      return false;
    if (filters.periodToUtc && s.createdAtUtc && s.createdAtUtc > filters.periodToUtc)
      return false;
    return true;
  });
}

function partyKey(s: ReportingSnapshotSource): string {
  if (s.driverId) return `driver:${s.driverId}`;
  if (s.agentId) return `agent:${s.agentId}`;
  return `unknown:${s.countryId}:${s.currency}`;
}

function sumMinors(values: Array<bigint | null>): string | null {
  let sum = 0n;
  let any = false;
  for (const v of values) {
    if (v == null) continue;
    sum += v;
    any = true;
  }
  return any ? sum.toString() : null;
}

function partyOutstanding(
  settlements: ReportingSettlementSource[],
  partyType: "driver" | "agent",
  partyId: string,
  currency: string,
  countryId: string,
): string | null {
  const rows = settlements.filter(
    (s) =>
      s.partyType === partyType &&
      s.partyId === partyId &&
      s.currency === currency &&
      s.countryId === countryId,
  );
  if (rows.length === 0) return null;
  return sumMinors(rows.map((s) => s.amountMinor != null && s.paidConfirmedMinor != null
    ? (s.amountMinor - s.paidConfirmedMinor)
    : s.amountMinor != null && s.paidConfirmedMinor == null
      ? s.amountMinor
      : null));
}

/**
 * Group certified cash snapshots by party+country+currency.
 * expected/collected = sum of snap grossFareMinor (SoT); outstanding from settlements when linkable.
 */
export function projectCashCollectionRows(
  bundle: FinanceReportingSourceBundle,
  filters: FinanceReportingDimensionFilters = {},
): CashCollectionRow[] {
  const snaps = filterCashSnaps(bundle.snapshots, filters);
  const groups = new Map<string, ReportingSnapshotSource[]>();
  for (const s of snaps) {
    const key = `${partyKey(s)}|${s.countryId}|${s.currency}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const rows: CashCollectionRow[] = [];
  for (const group of groups.values()) {
    const head = group[0]!;
    const partyType: CashCollectionRow["partyType"] = head.driverId
      ? "driver"
      : head.agentId
        ? "agent"
        : "unknown";
    const partyId = head.driverId ?? head.agentId ?? null;
    const grosses = group.map((s) => s.grossFareMinor);
    const collected = sumMinors(grosses);
    const incomplete = grosses.some((g) => g == null);
    let outstanding: string | null = null;
    if (partyType !== "unknown" && partyId) {
      outstanding = partyOutstanding(
        bundle.settlements,
        partyType,
        partyId,
        head.currency,
        head.countryId,
      );
    }
    const dates = group
      .map((s) => s.createdAtUtc)
      .filter((d): d is string => Boolean(d))
      .sort();
    const last = dates.length ? dates[dates.length - 1]! : null;
    let status: CashCollectionRow["status"] = "collected";
    if (incomplete || collected == null) status = "incomplete";
    else if (outstanding != null) {
      try {
        if (BigInt(outstanding) > 0n) status = "outstanding";
      } catch {
        status = "incomplete";
      }
    }
    rows.push({
      partyType,
      partyId,
      countryId: head.countryId,
      currency: head.currency,
      expectedMinor: collected,
      collectedMinor: collected,
      outstandingMinor: outstanding,
      lastCollectionUtc: last,
      status,
      snapshotIds: group.map((s) => s.id),
      tripCount: group.length,
    });
  }

  rows.sort((a, b) => {
    const da = a.lastCollectionUtc ?? "";
    const db = b.lastCollectionUtc ?? "";
    return db.localeCompare(da);
  });
  return rows;
}
