/**
 * Map settlement list commercial class + recon state → accountant badge.
 * Presentation only — does not change settlement math.
 */

import type { AccountantDataClass } from "@/domain/finance/reporting/AccountantDataClassification";
import type { SettlementListItem } from "@/domain/finance/reporting/FinanceReportingTypes";

function isOutstandingZero(outstandingMinor: string | null): boolean {
  if (outstandingMinor == null) return false;
  try {
    return BigInt(outstandingMinor) === 0n;
  } catch {
    return false;
  }
}

export function classifyAccountantSettlementListItem(
  row: SettlementListItem,
): AccountantDataClass {
  if (row.commercialClass === "legacy_orphan") return "historical";
  if (row.commercialClass === "qa_pilot") return "qa_test";
  if (row.outstandingMinor == null) return "incomplete";
  if (
    row.status === "settled" &&
    !isOutstandingZero(row.outstandingMinor)
  ) {
    return "conflict";
  }
  if (row.commercialClass === "commercial_certified") return "certified";
  if (isOutstandingZero(row.outstandingMinor) && row.status === "settled") {
    return "certified";
  }
  return "operational";
}
