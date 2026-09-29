/**
 * Finance clean reset — absolute scope lock.
 * ONLY finance-domain collections. Operational entities are forbidden.
 */

/** Collections that may be mutated/deleted during finance clean reset. */
export const FINANCE_CLEAN_RESET_ALLOWED_COLLECTIONS = [
  "finance_accounting_snapshots",
  "financial_settlements",
  "financial_settlement_payments",
  "finance_adjustments",
  "finance_adjustments_v2",
  "finance_refund_accounting",
  "finance_chargeback_accounting",
  "finance_payout_preparations",
  "finance_reconciliation_runs",
  "finance_audit_events",
  "settlements_v2",
  "settlement_payments_v2",
  "financial_periods",
  /** Wallet monetary state only — containers never deleted. */
  "wallets",
  /** Proven finance-only ledger lines (test/company_pay/topup). */
  "transactions",
] as const;

export type FinanceCleanResetAllowedCollection =
  (typeof FINANCE_CLEAN_RESET_ALLOWED_COLLECTIONS)[number];

/** Hard-forbidden collections — any proposed mutation → STOP. */
export const FINANCE_CLEAN_RESET_FORBIDDEN_COLLECTIONS = [
  "user",
  "order",
  "countries",
  "cities",
  "villages",
  "mkan",
  "type_car",
  "transport_company",
  "support",
  "admin_panel_notifications",
  "admin_next_driver_review_requests",
  "admin_users",
  "customers",
  "drivers",
  "agents",
  "partners",
  "guides",
  "tour_guides",
  "regions",
  "landmarks",
  "fleet",
  "vehicle_catalog",
] as const;

export type FinanceCleanResetOperation =
  | "DELETE_FINANCE_FIXTURE"
  | "RESET_FINANCIAL_BALANCE"
  | "ARCHIVE_FINANCE_ONLY"
  | "CREATE_FINANCE_AUDIT";

export const WALLET_RESET_AUDIT_REASON =
  "Finance clean cutover — operator confirmed prior balance non-real" as const;

export const FINANCE_CLEAN_RESET_OPERATOR_CONFIRMATION =
  "OLD_FINANCIAL_DATA_NON_REAL_TEST_ONLY" as const;

export function isFinanceCleanResetAllowedCollection(
  collection: string,
): collection is FinanceCleanResetAllowedCollection {
  return (FINANCE_CLEAN_RESET_ALLOWED_COLLECTIONS as readonly string[]).includes(
    collection,
  );
}

export function isFinanceCleanResetForbiddenCollection(
  collection: string,
): boolean {
  return (FINANCE_CLEAN_RESET_FORBIDDEN_COLLECTIONS as readonly string[]).includes(
    collection,
  );
}
