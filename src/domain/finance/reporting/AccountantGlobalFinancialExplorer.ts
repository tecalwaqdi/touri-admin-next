/**
 * Global financial explorer — ALL records with classification badges.
 * Presentation/read projection only. Official certified totals stay on Finance Home.
 */

import {
  classifyAccountantGenericId,
  classifyAccountantSettlement,
  classifyAccountantSnapshot,
  type AccountantDataClass,
} from "@/domain/finance/reporting/AccountantDataClassification";
import type {
  FinanceReportingDimensionFilters,
  FinanceReportingSourceBundle,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import { buildSnapshotIndex } from "@/domain/finance/reporting/SettlementCommercialCutover";

export type GlobalExplorerRecordType =
  | "snapshot"
  | "settlement"
  | "payment"
  | "adjustment";

export type GlobalFinancialExplorerRow = {
  id: string;
  recordType: GlobalExplorerRecordType;
  dataClass: AccountantDataClass;
  countryId: string | null;
  currency: string | null;
  partyType: "driver" | "agent" | "unknown" | null;
  partyId: string | null;
  amountMinor: string | null;
  status: string | null;
  occurredAtUtc: string | null;
  descriptionKey: string;
  relatedSettlementId: string | null;
  relatedOrderId: string | null;
  reasons: string[];
};

function matchesFilters(
  row: Pick<
    GlobalFinancialExplorerRow,
    "countryId" | "currency" | "partyType" | "partyId" | "occurredAtUtc"
  >,
  filters: FinanceReportingDimensionFilters,
  driverId: string | null | undefined,
  agentId: string | null | undefined,
): boolean {
  if (filters.countryId && row.countryId !== filters.countryId) return false;
  if (
    filters.currency &&
    row.currency &&
    row.currency.toUpperCase() !== filters.currency.toUpperCase()
  ) {
    return false;
  }
  if (filters.periodFromUtc && row.occurredAtUtc && row.occurredAtUtc < filters.periodFromUtc)
    return false;
  if (filters.periodToUtc && row.occurredAtUtc && row.occurredAtUtc > filters.periodToUtc)
    return false;
  if (driverId && !(row.partyType === "driver" && row.partyId === driverId)) return false;
  if (agentId && !(row.partyType === "agent" && row.partyId === agentId)) return false;
  return true;
}

/**
 * Project every financial source row in the scoped bundle with a classification badge.
 * Does not invent amounts — uses SoT minors only.
 */
export function projectGlobalFinancialExplorer(
  bundle: FinanceReportingSourceBundle,
  filters: FinanceReportingDimensionFilters = {},
  opts?: {
    dataClass?: AccountantDataClass | null;
    recordType?: GlobalExplorerRecordType | null;
    limit?: number;
  },
): GlobalFinancialExplorerRow[] {
  const snapsById = buildSnapshotIndex(bundle.snapshots);
  const rows: GlobalFinancialExplorerRow[] = [];
  const driverId = filters.driverId ?? null;
  const agentId = filters.agentId ?? null;
  const classFilter = opts?.dataClass ?? null;
  const typeFilter = opts?.recordType ?? null;
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);

  for (const s of bundle.snapshots) {
    const cls = classifyAccountantSnapshot({ snapshot: s });
    const row: GlobalFinancialExplorerRow = {
      id: s.id,
      recordType: "snapshot",
      dataClass: cls.dataClass,
      countryId: s.countryId,
      currency: s.currency,
      partyType: s.driverId ? "driver" : s.agentId ? "agent" : "unknown",
      partyId: s.driverId ?? s.agentId ?? null,
      amountMinor: s.grossFareMinor != null ? s.grossFareMinor.toString() : null,
      status: s.lifecycleCompleted ? "certified" : "incomplete",
      occurredAtUtc: s.createdAtUtc,
      descriptionKey: "explorerSnapshot",
      relatedSettlementId: null,
      relatedOrderId: s.orderId,
      reasons: cls.reasons,
    };
    if (typeFilter && typeFilter !== "snapshot") continue;
    if (classFilter && classFilter !== row.dataClass) continue;
    if (!matchesFilters(row, filters, driverId, agentId)) continue;
    rows.push(row);
  }

  for (const s of bundle.settlements) {
    const cls = classifyAccountantSettlement({
      settlement: s,
      snapshotsById: snapsById,
    });
    const row: GlobalFinancialExplorerRow = {
      id: s.id,
      recordType: "settlement",
      dataClass: cls.dataClass,
      countryId: s.countryId,
      currency: s.currency,
      partyType: s.partyType === "driver" || s.partyType === "agent" ? s.partyType : "unknown",
      partyId: s.partyId,
      amountMinor: s.amountMinor != null ? s.amountMinor.toString() : null,
      status: s.status,
      occurredAtUtc: s.updatedAtUtc,
      descriptionKey: "explorerSettlement",
      relatedSettlementId: s.id,
      relatedOrderId: null,
      reasons: cls.reasons,
    };
    if (typeFilter && typeFilter !== "settlement") continue;
    if (classFilter && classFilter !== row.dataClass) continue;
    if (!matchesFilters(row, filters, driverId, agentId)) continue;
    rows.push(row);
  }

  for (const p of bundle.payments) {
    const cls = classifyAccountantGenericId(p.id);
    const sett = bundle.settlements.find((x) => x.id === p.settlementId);
    const row: GlobalFinancialExplorerRow = {
      id: p.id,
      recordType: "payment",
      dataClass: cls.dataClass === "qa_test" ? "qa_test" : "operational",
      countryId: sett?.countryId ?? null,
      currency: p.currency ?? sett?.currency ?? null,
      partyType: sett?.partyType === "driver" || sett?.partyType === "agent" ? sett.partyType : null,
      partyId: sett?.partyId ?? null,
      amountMinor: p.amountMinor != null ? p.amountMinor.toString() : null,
      status: p.status,
      occurredAtUtc: p.createdAtUtc ?? null,
      descriptionKey: "explorerPayment",
      relatedSettlementId: p.settlementId,
      relatedOrderId: null,
      reasons: cls.reasons,
    };
    if (typeFilter && typeFilter !== "payment") continue;
    if (classFilter && classFilter !== row.dataClass) continue;
    if (!matchesFilters(row, filters, driverId, agentId)) continue;
    rows.push(row);
  }

  for (const a of bundle.adjustments) {
    const cls = classifyAccountantGenericId(a.id);
    const row: GlobalFinancialExplorerRow = {
      id: a.id,
      recordType: "adjustment",
      dataClass: cls.dataClass === "qa_test" ? "qa_test" : "operational",
      countryId: a.countryId,
      currency: a.currency,
      partyType: null,
      partyId: null,
      amountMinor: a.amountMinor != null ? a.amountMinor.toString() : null,
      status: a.status,
      occurredAtUtc: a.createdAtUtc ?? null,
      descriptionKey: "explorerAdjustment",
      relatedSettlementId: a.relatedSettlementId ?? null,
      relatedOrderId: a.relatedOrderId ?? null,
      reasons: cls.reasons,
    };
    if (typeFilter && typeFilter !== "adjustment") continue;
    if (classFilter && classFilter !== row.dataClass) continue;
    if (!matchesFilters(row, filters, driverId, agentId)) continue;
    rows.push(row);
  }

  rows.sort((a, b) => {
    const ta = a.occurredAtUtc ?? "";
    const tb = b.occurredAtUtc ?? "";
    return tb.localeCompare(ta);
  });

  return rows.slice(0, limit);
}

export function countByDataClass(
  rows: readonly GlobalFinancialExplorerRow[],
): Record<AccountantDataClass, number> {
  const out: Record<AccountantDataClass, number> = {
    certified: 0,
    operational: 0,
    historical: 0,
    qa_test: 0,
    incomplete: 0,
    conflict: 0,
    uncertified: 0,
  };
  for (const r of rows) out[r.dataClass] += 1;
  return out;
}
