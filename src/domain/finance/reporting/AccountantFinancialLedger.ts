/**
 * Thin projection: wallet txs + settlement payments → accountant movement rows.
 * No balance invention — display SoT amounts/directions only.
 */

import type {
  FinanceReportingDimensionFilters,
  FinanceReportingSourceBundle,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import type { DriverWalletLedgerEntry } from "@/domain/finance/wallet/DriverWalletReadModels";

export type FinancialMovementRow = {
  id: string;
  dateUtc: string | null;
  reference: string;
  description: string;
  direction: "debit" | "credit" | "unknown" | null;
  amountMinor: string | null;
  currency: string | null;
  actor: string | null;
  movementType: "wallet_transaction" | "settlement_payment";
  driverId: string | null;
  agentId: string | null;
  settlementId: string | null;
  orderId: string | null;
};

export function projectSettlementPaymentMovements(
  bundle: FinanceReportingSourceBundle,
  filters: FinanceReportingDimensionFilters = {},
): FinancialMovementRow[] {
  const settById = new Map(bundle.settlements.map((s) => [s.id, s]));
  const rows: FinancialMovementRow[] = [];
  for (const p of bundle.payments) {
    const sett = settById.get(p.settlementId);
    if (filters.countryId && sett && sett.countryId !== filters.countryId) continue;
    if (filters.currency && p.currency.toUpperCase() !== filters.currency.toUpperCase())
      continue;
    if (filters.driverId && sett?.partyType === "driver" && sett.partyId !== filters.driverId)
      continue;
    if (filters.agentId && sett?.partyType === "agent" && sett.partyId !== filters.agentId)
      continue;
    if (filters.periodFromUtc && p.createdAtUtc && p.createdAtUtc < filters.periodFromUtc)
      continue;
    if (filters.periodToUtc && p.createdAtUtc && p.createdAtUtc > filters.periodToUtc)
      continue;
    const status = String(p.status).toLowerCase();
    let direction: FinancialMovementRow["direction"] = "unknown";
    if (status === "confirmed") direction = "credit";
    else if (status === "reversed") direction = "debit";
    rows.push({
      id: `pay:${p.id}`,
      dateUtc: p.confirmedAtUtc ?? p.createdAtUtc,
      reference: p.reference ?? p.id,
      description: `settlement_payment:${status}`,
      direction,
      amountMinor: p.amountMinor != null ? p.amountMinor.toString() : null,
      currency: p.currency,
      actor: p.confirmedBy ?? p.createdBy ?? null,
      movementType: "settlement_payment",
      driverId: sett?.partyType === "driver" ? sett.partyId : null,
      agentId: sett?.partyType === "agent" ? sett.partyId : null,
      settlementId: p.settlementId,
      orderId: sett?.sourceOrderId ?? null,
    });
  }
  return rows;
}

export function projectWalletLedgerMovements(
  entries: DriverWalletLedgerEntry[],
  filters: FinanceReportingDimensionFilters = {},
): FinancialMovementRow[] {
  return entries
    .filter((e) => {
      if (filters.driverId && e.driverId !== filters.driverId) return false;
      if (
        filters.currency &&
        e.currency &&
        e.currency.toUpperCase() !== filters.currency.toUpperCase()
      )
        return false;
      if (filters.periodFromUtc && e.createdAtUtc && e.createdAtUtc < filters.periodFromUtc)
        return false;
      if (filters.periodToUtc && e.createdAtUtc && e.createdAtUtc > filters.periodToUtc)
        return false;
      return true;
    })
    .map((e) => ({
      id: `wtx:${e.transactionId}`,
      dateUtc: e.createdAtUtc,
      reference: e.transactionId,
      description: e.note ?? e.type ?? "wallet_transaction",
      direction: e.direction,
      amountMinor: e.amountMinor,
      currency: e.currency,
      actor: null,
      movementType: "wallet_transaction" as const,
      driverId: e.driverId,
      agentId: null,
      settlementId: null,
      orderId: null,
    }));
}

export function mergeFinancialMovements(
  a: FinancialMovementRow[],
  b: FinancialMovementRow[],
): FinancialMovementRow[] {
  return [...a, ...b].sort((x, y) => {
    const dx = x.dateUtc ?? "";
    const dy = y.dateUtc ?? "";
    return dy.localeCompare(dx);
  });
}
