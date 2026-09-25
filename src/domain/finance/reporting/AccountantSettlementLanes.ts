/**
 * Accountant settlement workflow lanes — presentation mapping over Settlement V2 statuses.
 * Does not invent statuses or change SoD.
 */

import type { SettlementListItem } from "@/domain/finance/reporting/FinanceReportingTypes";

export type AccountantSettlementLaneId =
  | "needs_prepare"
  | "awaiting_approval"
  | "awaiting_payment"
  | "paid"
  | "reconciled";

export const ACCOUNTANT_SETTLEMENT_LANES: ReadonlyArray<{
  id: AccountantSettlementLaneId;
  /** V2 statuses included in this lane (empty = custom predicate). */
  statuses: ReadonlyArray<string>;
  labelKey: string;
}> = [
  {
    id: "needs_prepare",
    statuses: ["draft"],
    labelKey: "laneNeedsPrepare",
  },
  {
    id: "awaiting_approval",
    statuses: ["draft"],
    labelKey: "laneAwaitingApproval",
  },
  {
    id: "awaiting_payment",
    statuses: ["locked"],
    labelKey: "laneAwaitingPayment",
  },
  {
    id: "paid",
    statuses: ["partially_paid", "settled"],
    labelKey: "lanePaid",
  },
  {
    id: "reconciled",
    statuses: ["settled"],
    labelKey: "laneReconciled",
  },
];

/**
 * Filter settlements for a lane.
 * needs_prepare and awaiting_approval both use draft (SoD: prepare/create then approve→locked).
 * reconciled prefers settled with no outstanding when amount known.
 */
export function settlementsInLane(
  items: readonly SettlementListItem[],
  lane: AccountantSettlementLaneId,
): SettlementListItem[] {
  switch (lane) {
    case "needs_prepare":
    case "awaiting_approval":
      return items.filter((s) => s.status === "draft");
    case "awaiting_payment":
      return items.filter((s) => s.status === "locked");
    case "paid":
      return items.filter(
        (s) => s.status === "partially_paid" || s.status === "settled",
      );
    case "reconciled":
      return items.filter((s) => {
        if (s.status !== "settled") return false;
        if (s.outstandingMinor == null) return true;
        try {
          return BigInt(s.outstandingMinor) === 0n;
        } catch {
          return false;
        }
      });
    default:
      return [];
  }
}

export function settlementStatusCounts(
  items: readonly SettlementListItem[],
): Record<string, number> {
  const out: Record<string, number> = {
    draft: 0,
    locked: 0,
    partially_paid: 0,
    settled: 0,
    voided: 0,
  };
  for (const s of items) {
    const key = s.status;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** Query param value for lane → settlementStatus (primary). */
export function settlementStatusForLane(
  lane: AccountantSettlementLaneId,
): string | null {
  switch (lane) {
    case "needs_prepare":
    case "awaiting_approval":
      return "draft";
    case "awaiting_payment":
      return "locked";
    case "paid":
      return "settled";
    case "reconciled":
      return "settled";
    default:
      return null;
  }
}
