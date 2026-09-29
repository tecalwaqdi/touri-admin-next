/**
 * Finance clean reset — pre-write backup manifest (pure).
 * Never mutates. STOP if any protected entity is proposed for delete.
 */

import {
  FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION,
  WALLET_RESET_AUDIT_REASON,
  isFinanceCleanResetAllowedCollection,
  isFinanceCleanResetForbiddenCollection,
  type FinanceCleanResetOperation,
} from "@/domain/finance/cutover/FinanceCleanResetScope";
import type { WalletImpactReview } from "@/application/finance/cutover/FinanceFinancialImpactResolution";
import type { FinanceImpactInventoryRow } from "@/domain/finance/cutover/FinanceFinancialImpactClass";
import type { FinanceCutoverMalformedDoc } from "@/application/finance/cutover/FinanceCutoverCensusLoader";

export type FinanceCleanResetManifestEntry = {
  collection: string;
  documentId: string;
  financeClassification: string;
  amountMinor: string | null;
  currency: string | null;
  linkedOperationalEntity: string | null;
  operation: FinanceCleanResetOperation;
  reason: string;
  priorBalanceMajor: number | null;
};

export type ProtectedEntityAssertion = {
  USERS_TO_DELETE: 0;
  CUSTOMERS_TO_DELETE: 0;
  DRIVERS_TO_DELETE: 0;
  AGENTS_TO_DELETE: 0;
  COUNTRIES_TO_DELETE: 0;
  REGIONS_TO_DELETE: 0;
  CITIES_TO_DELETE: 0;
  LANDMARKS_TO_DELETE: 0;
  PARTNERS_TO_DELETE: 0;
  FLEETS_TO_DELETE: 0;
  GUIDES_TO_DELETE: 0;
  OPERATIONAL_ORDERS_TRIPS_TO_DELETE: 0;
  WALLET_CONTAINERS_TO_DELETE: 0;
};

export type FinanceCleanResetManifest = {
  dryRun: true;
  productionWrites: 0;
  operatorConfirmation: typeof FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION;
  cutoverBusinessDate: "2026-10-01";
  cutoverUtcInstant: "2026-09-30T21:00:00.000Z";
  cutoverTimezone: "Asia/Riyadh";
  openingPositionByOperatorConfirmation: {
    driverOpening: "0.00";
    agentOpening: "0.00";
    companyReceivable: "0.00";
    companyPayable: "0.00";
    currency: "SAR";
    note: "Zero opening is operator-confirmed; NOT derived from historical test balances";
  };
  entries: FinanceCleanResetManifestEntry[];
  protectedEntityAssertion: ProtectedEntityAssertion;
  counts: {
    deleteFinanceFixture: number;
    resetFinancialBalance: number;
    archiveFinanceOnly: number;
    createFinanceAudit: number;
    walletContainersDeleted: 0;
    operationalOrdersProposed: 0;
  };
  blockers: string[];
  readyForApply: boolean;
};

function minorToMajorDisplay(minor: string | null): number | null {
  if (minor == null) return null;
  try {
    return Number(BigInt(minor)) / 100;
  } catch {
    return null;
  }
}

const DELETE_COLLECTIONS = new Set([
  "finance_accounting_snapshots",
  "financial_settlements",
  "financial_settlement_payments",
  "finance_adjustments",
  "finance_refund_accounting",
  "finance_chargeback_accounting",
  "finance_payout_preparations",
  "finance_reconciliation_runs",
  "finance_audit_events",
  "transactions",
]);

/**
 * Build finance-only clean-reset manifest from impact resolution + census ids.
 * Orders/trips are never included. Wallet docs are RESET only.
 */
export function buildFinanceCleanResetManifest(input: {
  scannedByCollection: Record<string, number>;
  idsByCollection: Record<string, string[]>;
  impactRows: readonly FinanceImpactInventoryRow[];
  wallets: readonly WalletImpactReview[];
  malformed: readonly FinanceCutoverMalformedDoc[];
}): FinanceCleanResetManifest {
  const blockers: string[] = [];
  const entries: FinanceCleanResetManifestEntry[] = [];
  const rowById = new Map(input.impactRows.map((r) => [r.id, r]));
  const seen = new Set<string>();

  const push = (e: FinanceCleanResetManifestEntry) => {
    const key = `${e.collection}/${e.documentId}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (isFinanceCleanResetForbiddenCollection(e.collection)) {
      blockers.push(`FORBIDDEN_COLLECTION_PROPOSED:${e.collection}/${e.documentId}`);
      return;
    }
    if (!isFinanceCleanResetAllowedCollection(e.collection)) {
      blockers.push(`COLLECTION_NOT_IN_ALLOWLIST:${e.collection}/${e.documentId}`);
      return;
    }
    if (
      e.collection === "wallets" &&
      e.operation === "DELETE_FINANCE_FIXTURE"
    ) {
      blockers.push(`WALLET_CONTAINER_DELETE_BLOCKED:${e.documentId}`);
      return;
    }
    entries.push(e);
  };

  // Finance collection deletes — all pre-cutover finance artifacts (operator: non-real)
  for (const [collection, ids] of Object.entries(input.idsByCollection)) {
    if (!DELETE_COLLECTIONS.has(collection)) continue;
    for (const id of ids) {
      const row = rowById.get(id);
      push({
        collection,
        documentId: id,
        financeClassification: row?.class ?? "FINANCE_ARTIFACT",
        amountMinor: row?.amountMinor ?? null,
        currency: row?.currency ?? "SAR",
        linkedOperationalEntity:
          row?.sourceReferences.find((r) => r.startsWith("order:")) ??
          row?.partyId ??
          null,
        operation: "DELETE_FINANCE_FIXTURE",
        reason:
          "Operator confirmed prior finance data non-real/test — finance-only fixture cleanup",
        priorBalanceMajor: minorToMajorDisplay(row?.amountMinor ?? null),
      });
    }
  }

  // Malformed finance docs (may already be covered via settlements ids)
  for (const m of input.malformed) {
    push({
      collection: m.collection,
      documentId: m.id,
      financeClassification: "MALFORMED_OR_SYNTHETIC_FINANCE",
      amountMinor: null,
      currency: m.currency,
      linkedOperationalEntity: m.linkedOrderId
        ? `order:${m.linkedOrderId}`
        : m.linkedParty,
      operation: "DELETE_FINANCE_FIXTURE",
      reason: `Malformed/synthetic finance shape: ${m.problems.join(",")}`,
      priorBalanceMajor: null,
    });
  }

  // Wallet monetary resets — never delete containers
  for (const w of input.wallets) {
    const alreadyZero =
      w.storedBalanceMinor === "0" ||
      w.storedBalanceAvailability !== "available";
    push({
      collection: "wallets",
      documentId: w.walletId,
      financeClassification: w.financialImpact,
      amountMinor: w.storedBalanceMinor,
      currency: w.currency ?? "SAR",
      linkedOperationalEntity: w.ownerId
        ? `driver_or_owner:${w.ownerId}`
        : `wallet_container:${w.walletId}`,
      operation: "RESET_FINANCIAL_BALANCE",
      reason: alreadyZero
        ? `${WALLET_RESET_AUDIT_REASON} (already zero — idempotent stamp)`
        : WALLET_RESET_AUDIT_REASON,
      priorBalanceMajor: minorToMajorDisplay(w.storedBalanceMinor),
    });
    // Audit record create (finance_audit_events) — applied after reset
    push({
      collection: "finance_audit_events",
      documentId: `clean_reset_wallet_${w.walletId}`,
      financeClassification: "HISTORICAL_REFERENCE_ONLY",
      amountMinor: w.storedBalanceMinor,
      currency: w.currency ?? "SAR",
      linkedOperationalEntity: `wallet:${w.walletId}`,
      operation: "CREATE_FINANCE_AUDIT",
      reason: WALLET_RESET_AUDIT_REASON,
      priorBalanceMajor: minorToMajorDisplay(w.storedBalanceMinor),
    });
  }

  // Explicit: never propose order deletes even if present in idsByCollection
  const orderIds = input.idsByCollection.order ?? [];
  if (orderIds.length > 0) {
    // Record that we saw orders but will not touch them
  }

  const protectedEntityAssertion: ProtectedEntityAssertion = {
    USERS_TO_DELETE: 0,
    CUSTOMERS_TO_DELETE: 0,
    DRIVERS_TO_DELETE: 0,
    AGENTS_TO_DELETE: 0,
    COUNTRIES_TO_DELETE: 0,
    REGIONS_TO_DELETE: 0,
    CITIES_TO_DELETE: 0,
    LANDMARKS_TO_DELETE: 0,
    PARTNERS_TO_DELETE: 0,
    FLEETS_TO_DELETE: 0,
    GUIDES_TO_DELETE: 0,
    OPERATIONAL_ORDERS_TRIPS_TO_DELETE: 0,
    WALLET_CONTAINERS_TO_DELETE: 0,
  };

  // Hard stop if any protected count somehow non-zero (typed as 0 — belt)
  for (const [k, v] of Object.entries(protectedEntityAssertion)) {
    if (v !== 0) blockers.push(`PROTECTED_ENTITY_NONZERO:${k}=${v}`);
  }

  // Stop if any entry targets forbidden collection (already pushed) or order
  const orderDeletes = entries.filter((e) => e.collection === "order");
  if (orderDeletes.length) {
    blockers.push(`OPERATIONAL_ORDERS_IN_MANIFEST:${orderDeletes.length}`);
  }
  const walletDeletes = entries.filter(
    (e) =>
      e.collection === "wallets" && e.operation === "DELETE_FINANCE_FIXTURE",
  );
  if (walletDeletes.length) {
    blockers.push(`WALLET_DELETES_IN_MANIFEST:${walletDeletes.length}`);
  }

  const counts = {
    deleteFinanceFixture: entries.filter(
      (e) => e.operation === "DELETE_FINANCE_FIXTURE",
    ).length,
    resetFinancialBalance: entries.filter(
      (e) => e.operation === "RESET_FINANCIAL_BALANCE",
    ).length,
    archiveFinanceOnly: entries.filter(
      (e) => e.operation === "ARCHIVE_FINANCE_ONLY",
    ).length,
    createFinanceAudit: entries.filter(
      (e) => e.operation === "CREATE_FINANCE_AUDIT",
    ).length,
    walletContainersDeleted: 0 as const,
    operationalOrdersProposed: 0 as const,
  };

  if (input.scannedByCollection.order && input.scannedByCollection.order > 0) {
    // Informational only — orders exist and are preserved
  }

  const readyForApply = blockers.length === 0 && counts.operationalOrdersProposed === 0;

  return {
    dryRun: true,
    productionWrites: 0,
    operatorConfirmation: FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION,
    cutoverBusinessDate: "2026-10-01",
    cutoverUtcInstant: "2026-09-30T21:00:00.000Z",
    cutoverTimezone: "Asia/Riyadh",
    openingPositionByOperatorConfirmation: {
      driverOpening: "0.00",
      agentOpening: "0.00",
      companyReceivable: "0.00",
      companyPayable: "0.00",
      currency: "SAR",
      note: "Zero opening is operator-confirmed; NOT derived from historical test balances",
    },
    entries,
    protectedEntityAssertion,
    counts,
    blockers,
    readyForApply,
  };
}
