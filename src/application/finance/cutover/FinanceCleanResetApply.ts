/**
 * Finance clean reset APPLY — finance collections only.
 * Hard-stops on forbidden collections / order deletes / wallet container deletes.
 */

import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import {
  FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION,
  WALLET_RESET_AUDIT_REASON,
  isFinanceCleanResetAllowedCollection,
  isFinanceCleanResetForbiddenCollection,
} from "@/domain/finance/cutover/FinanceCleanResetScope";
import type {
  FinanceCleanResetManifest,
  FinanceCleanResetManifestEntry,
} from "@/application/finance/cutover/FinanceCleanResetManifest";

export type FinanceCleanResetApplyResult = {
  dryRun: false;
  operatorConfirmation: typeof FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION;
  financeRecordsDeleted: number;
  financeRecordsArchived: number;
  walletsMonetaryStateReset: number;
  walletContainersDeleted: 0;
  financeAuditsCreated: number;
  protectedDeletes: {
    users: 0;
    customers: 0;
    drivers: 0;
    agents: 0;
    geography: 0;
    partnersFleetsGuides: 0;
    ordersTrips: 0;
  };
  unexpectedNonFinanceMutations: false;
  applied: Array<{
    collection: string;
    documentId: string;
    operation: string;
    ok: boolean;
    error?: string;
  }>;
  blockers: string[];
  productionWrites: number;
};

function assertEntrySafe(entry: FinanceCleanResetManifestEntry): string | null {
  if (isFinanceCleanResetForbiddenCollection(entry.collection)) {
    return `FORBIDDEN_COLLECTION:${entry.collection}`;
  }
  if (!isFinanceCleanResetAllowedCollection(entry.collection)) {
    return `NOT_ALLOWLISTED:${entry.collection}`;
  }
  if (
    entry.collection === "wallets" &&
    entry.operation === "DELETE_FINANCE_FIXTURE"
  ) {
    return `WALLET_DELETE_FORBIDDEN:${entry.documentId}`;
  }
  return null;
}

const DELETE_ORDER = [
  "financial_settlement_payments",
  "finance_adjustments",
  "finance_adjustments_v2",
  "financial_settlements",
  "finance_accounting_snapshots",
  "transactions",
  "finance_audit_events",
  "finance_reconciliation_runs",
  "finance_refund_accounting",
  "finance_chargeback_accounting",
  "finance_payout_preparations",
  "settlements_v2",
  "settlement_payments_v2",
] as const;

/**
 * Apply a pre-built finance-only clean-reset manifest.
 * Callers must verify FINANCE_WRITE_ENABLED and operator confirmation.
 */
export async function applyFinanceCleanReset(input: {
  port: ProductionFirestoreWritePort;
  manifest: FinanceCleanResetManifest;
  operatorConfirmation: string;
  actorEmail: string;
}): Promise<FinanceCleanResetApplyResult> {
  const blockers: string[] = [];
  if (
    input.operatorConfirmation !== FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION
  ) {
    blockers.push("OPERATOR_CONFIRMATION_MISMATCH");
  }
  if (!input.manifest.readyForApply) {
    blockers.push("MANIFEST_NOT_READY");
    blockers.push(...input.manifest.blockers);
  }
  for (const [k, v] of Object.entries(input.manifest.protectedEntityAssertion)) {
    if (v !== 0) blockers.push(`PROTECTED_NONZERO:${k}`);
  }
  if (input.manifest.counts.operationalOrdersProposed !== 0) {
    blockers.push("OPERATIONAL_ORDERS_PROPOSED");
  }
  if (input.manifest.counts.walletContainersDeleted !== 0) {
    blockers.push("WALLET_CONTAINERS_DELETE_PROPOSED");
  }
  if (!input.port.deleteDocument) {
    blockers.push("DELETE_DOCUMENT_UNSUPPORTED_ON_PORT");
  }

  const applied: FinanceCleanResetApplyResult["applied"] = [];
  if (blockers.length > 0) {
    return {
      dryRun: false,
      operatorConfirmation: FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION,
      financeRecordsDeleted: 0,
      financeRecordsArchived: 0,
      walletsMonetaryStateReset: 0,
      walletContainersDeleted: 0,
      financeAuditsCreated: 0,
      protectedDeletes: {
        users: 0,
        customers: 0,
        drivers: 0,
        agents: 0,
        geography: 0,
        partnersFleetsGuides: 0,
        ordersTrips: 0,
      },
      unexpectedNonFinanceMutations: false,
      applied,
      blockers,
      productionWrites: 0,
    };
  }

  let productionWrites = 0;
  let deleted = 0;
  let archived = 0;
  let reset = 0;
  let audits = 0;

  const deletes = input.manifest.entries
    .filter((e) => e.operation === "DELETE_FINANCE_FIXTURE")
    .sort((a, b) => {
      const ai = DELETE_ORDER.indexOf(
        a.collection as (typeof DELETE_ORDER)[number],
      );
      const bi = DELETE_ORDER.indexOf(
        b.collection as (typeof DELETE_ORDER)[number],
      );
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

  for (const entry of deletes) {
    const bad = assertEntrySafe(entry);
    if (bad) {
      blockers.push(bad);
      break;
    }
    try {
      await input.port.deleteDocument!(entry.collection, entry.documentId);
      productionWrites += 1;
      deleted += 1;
      applied.push({
        collection: entry.collection,
        documentId: entry.documentId,
        operation: entry.operation,
        ok: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // IAM often allows create/update but not hard delete — archive tombstone fallback.
      if (msg.includes("DELETE_403") || msg.includes("DELETE_401") || msg.includes("PERMISSION")) {
        try {
          await input.port.updateDocument(entry.collection, entry.documentId, {
            financeCleanResetArchived: true,
            exclude_from_real_reporting: true,
            financeCleanResetAtUtc: new Date().toISOString(),
            financeCleanResetReason:
              "Finance clean cutover — operator confirmed prior finance non-real (archive fallback; hard delete IAM denied)",
            financeCleanResetOperation: "ARCHIVE_FINANCE_ONLY",
          });
          productionWrites += 1;
          archived += 1;
          applied.push({
            collection: entry.collection,
            documentId: entry.documentId,
            operation: "ARCHIVE_FINANCE_ONLY",
            ok: true,
          });
          continue;
        } catch (err2) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          applied.push({
            collection: entry.collection,
            documentId: entry.documentId,
            operation: "ARCHIVE_FINANCE_ONLY",
            ok: false,
            error: msg2.slice(0, 200),
          });
          blockers.push(
            `ARCHIVE_FALLBACK_FAILED:${entry.collection}/${entry.documentId}:${msg2.slice(0, 80)}`,
          );
          break;
        }
      }
      applied.push({
        collection: entry.collection,
        documentId: entry.documentId,
        operation: entry.operation,
        ok: false,
        error: msg.slice(0, 200),
      });
      blockers.push(`DELETE_FAILED:${entry.collection}/${entry.documentId}:${msg.slice(0, 80)}`);
      break;
    }
  }

  if (blockers.length === 0) {
    const resets = input.manifest.entries.filter(
      (e) => e.operation === "RESET_FINANCIAL_BALANCE",
    );
    for (const entry of resets) {
      const bad = assertEntrySafe(entry);
      if (bad) {
        blockers.push(bad);
        break;
      }
      try {
        await input.port.updateDocument(entry.collection, entry.documentId, {
          currentBalance: 0,
          walletBalance: 0,
          financeCleanResetAtUtc: new Date().toISOString(),
          financeCleanResetReason: WALLET_RESET_AUDIT_REASON,
          financeCleanResetPriorBalanceMinor: entry.amountMinor,
          financeCleanResetPriorBalanceMajor: entry.priorBalanceMajor,
        });
        productionWrites += 1;
        reset += 1;
        applied.push({
          collection: entry.collection,
          documentId: entry.documentId,
          operation: entry.operation,
          ok: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        applied.push({
          collection: entry.collection,
          documentId: entry.documentId,
          operation: entry.operation,
          ok: false,
          error: msg.slice(0, 200),
        });
        blockers.push(
          `WALLET_RESET_FAILED:${entry.documentId}:${msg.slice(0, 80)}`,
        );
        break;
      }
    }
  }

  if (blockers.length === 0) {
    const auditCreates = input.manifest.entries.filter(
      (e) => e.operation === "CREATE_FINANCE_AUDIT",
    );
    for (const entry of auditCreates) {
      const bad = assertEntrySafe(entry);
      if (bad) {
        blockers.push(bad);
        break;
      }
      try {
        await input.port.createDocument(entry.collection, entry.documentId, {
          type: "finance_clean_reset_wallet",
          reason: WALLET_RESET_AUDIT_REASON,
          walletId: entry.documentId.replace(/^clean_reset_wallet_/, ""),
          priorBalanceMinor: entry.amountMinor,
          priorBalanceMajor: entry.priorBalanceMajor,
          currency: entry.currency ?? "SAR",
          newBalanceMajor: 0,
          actorEmail: input.actorEmail,
          createdAtUtc: new Date().toISOString(),
          cutoverBusinessDate: "2026-10-01",
          schemaVersion: 1,
        });
        productionWrites += 1;
        audits += 1;
        applied.push({
          collection: entry.collection,
          documentId: entry.documentId,
          operation: entry.operation,
          ok: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Idempotent if already exists
        if (msg.includes("ALREADY_EXISTS")) {
          audits += 1;
          applied.push({
            collection: entry.collection,
            documentId: entry.documentId,
            operation: entry.operation,
            ok: true,
          });
          continue;
        }
        applied.push({
          collection: entry.collection,
          documentId: entry.documentId,
          operation: entry.operation,
          ok: false,
          error: msg.slice(0, 200),
        });
        blockers.push(
          `AUDIT_CREATE_FAILED:${entry.documentId}:${msg.slice(0, 80)}`,
        );
        break;
      }
    }
  }

  return {
    dryRun: false,
    operatorConfirmation: FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION,
    financeRecordsDeleted: deleted,
    financeRecordsArchived: archived,
    walletsMonetaryStateReset: reset,
    walletContainersDeleted: 0,
    financeAuditsCreated: audits,
    protectedDeletes: {
      users: 0,
      customers: 0,
      drivers: 0,
      agents: 0,
      geography: 0,
      partnersFleetsGuides: 0,
      ordersTrips: 0,
    },
    unexpectedNonFinanceMutations: false,
    applied,
    blockers,
    productionWrites,
  };
}
