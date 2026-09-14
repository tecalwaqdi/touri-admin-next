/**
 * Finance FR5 Settlement Execution / Collection pilot — constants.
 * Preparation only. FINANCE_WRITE_ENABLED stays false until a separate armed live session.
 * Input SoT: FR4-locked Settlement V2 (reuse; no second settlement / no second book).
 * DRIVER_PAYS_COMPANY = company collects from driver (NOT company→driver payout).
 * Canonical V2: createPayment(pending) → confirmPayment(confirmed) → settlement settled.
 */

import {
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_AUDIT_COLLECTION,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  FINANCE_FR2_SETTLEMENT_COLLECTION,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import {
  FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";

export const FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY_ENV =
  "FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY" as const;

export const FINANCE_FR5_EXPECTED_PROJECT_ID = FINANCE_FR1_EXPECTED_PROJECT_ID;

export const FINANCE_FR5_EXPECTED_ADC_PRINCIPAL =
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;

export const FINANCE_FR5_SETTLEMENT_COLLECTION =
  FINANCE_FR2_SETTLEMENT_COLLECTION;

/**
 * Production Firestore collection (Legacy Settlement V2).
 * Domain resourceType alias used by Admin Next commands: settlement_payments.
 */
export const FINANCE_FR5_PAYMENT_COLLECTION =
  "financial_settlement_payments" as const;

/** Domain / write-count key alias (Admin Next SettlementCommandService resourceType). */
export const FINANCE_FR5_PAYMENT_RESOURCE_TYPE = "settlement_payments" as const;

export const FINANCE_FR5_AUDIT_COLLECTION = FINANCE_FR1_AUDIT_COLLECTION;

export const FINANCE_FR5_IDEMPOTENCY_COLLECTION =
  FINANCE_FR1_IDEMPOTENCY_COLLECTION;

export const FINANCE_FR5_SOURCE_SNAPSHOT_COLLECTION =
  FINANCE_FR1_SNAPSHOT_COLLECTION;
export const FINANCE_FR5_SOURCE_SNAPSHOT_ID = FINANCE_FR2_SOURCE_SNAPSHOT_ID;
export const FINANCE_FR5_SETTLEMENT_DOC_ID = FINANCE_FR2_SETTLEMENT_DOC_ID;
export const FINANCE_FR5_FR4_IDEMPOTENCY_DOC_ID =
  FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID;
export const FINANCE_FR5_SOURCE_ORDER_ID = FINANCE_FR1_SYNTHETIC_ORDER_ID;

export const FINANCE_FR5_PAYMENT_DOC_ID =
  "test_adminnext_finance_fr5_settlement_payment_001" as const;

export const FINANCE_FR5_PILOT_CLIENT_KEY =
  "finance_fr5_settlement_execution_pilot_v1" as const;

export const FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID =
  "finance_fr5_settlement_execution_pilot_v1" as const;

export const FINANCE_FR5_ALLOWED_WRITE_COLLECTIONS = [
  FINANCE_FR5_SETTLEMENT_COLLECTION,
  FINANCE_FR5_PAYMENT_COLLECTION,
  FINANCE_FR5_AUDIT_COLLECTION,
  FINANCE_FR5_IDEMPOTENCY_COLLECTION,
] as const;

export const FINANCE_FR5_FORBIDDEN_WRITE_COLLECTIONS = [
  "order",
  "finance_accounting_snapshots",
  "settlement_payment_intents",
  "finance_payout_preparations",
  "finance_refund_accounting",
  "finance_adjustments",
  "finance_reconciliation_runs",
  "users",
  "user",
  "drivers",
  "agents",
  "customers",
  "admin_next_finance_fr1_order_fixtures",
  "driver_ledger",
  "driver_wallets",
] as const;

/**
 * First successful FR5 full-collection apply (not this prep session):
 * 1 settlement UPDATE + 1 payment CREATE (confirmed final) + 2 audit + 1 idempotency.
 * createPayment→confirmPayment executed atomically; payment persisted once as confirmed.
 */
export const FINANCE_FR5_EXPECTED_WRITE_COUNTS = {
  financial_settlements: 1,
  settlement_payments: 1,
  finance_audit_events: 2,
  admin_next_cw_idempotency: 1,
  finance_accounting_snapshots: 0,
  order: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 5,
} as const;

export const FINANCE_FR5_ALREADY_APPLIED_WRITE_COUNTS = {
  financial_settlements: 0,
  settlement_payments: 0,
  finance_audit_events: 0,
  admin_next_cw_idempotency: 0,
  finance_accounting_snapshots: 0,
  order: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 0,
} as const;

export const FINANCE_FR5_ZERO_WRITE_COUNTS =
  FINANCE_FR5_ALREADY_APPLIED_WRITE_COUNTS;

export const FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS =
  "FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS" as const;

export const FINANCE_FR5_APPLY_SAFE_SUMMARY_PATH =
  ".local/finance-fr5-pilot/apply-safe-summary.json" as const;

export const FINANCE_FR5_PREP_SAFE_SUMMARY_PATH =
  ".local/finance-fr5-pilot/prep-safe-summary.json" as const;

/** Settlement V2 status after full collection confirm. */
export const FINANCE_FR5_POST_EXECUTION_STATUS = "settled" as const;

/** Payment V2 status after confirm. */
export const FINANCE_FR5_POST_PAYMENT_STATUS = "confirmed" as const;

/**
 * Exact settlement status transition for full outstanding collection.
 * (partially_paid skipped — payment amount == outstanding == amountMinor)
 */
export const FINANCE_FR5_EXACT_TRANSITION =
  "locked → settled (payment pending→confirmed; full collection)" as const;

export const FINANCE_FR5_EXACT_EXECUTION_DIRECTION =
  "DRIVER_PAYS_COMPANY (company collects from driver; NOT payout)" as const;

export const FINANCE_FR5_PAYMENT_AMOUNT_MINOR = "1500" as const;
export const FINANCE_FR5_PAYMENT_CURRENCY = "SAR" as const;

/** No bank/gateway success invented; no wallet. */
export const FINANCE_FR5_PAYMENT_METHOD = "existing_company_payment" as const;

export const FINANCE_FR5_ALLOWED_SETTLEMENT_FIELD_MUTATIONS = [
  "status",
  "paidConfirmedMinor",
  "outstandingMinor",
  "paymentIds",
  "paymentCount",
  "lastPaymentAt",
  "settledAt",
  "settledBy",
  "paymentExecutionForbidden",
  "updatedAtUtc",
] as const;

export const FINANCE_FR5_REQUIRED_RBAC_PERMISSION =
  "settlements:execute" as const;

export const FINANCE_FR5_CANONICAL_MECHANISM =
  "Settlement V2 createPayment(pending) → confirmPayment(confirmed) via SettlementCommandService; RBAC settlements:execute; collection financial_settlement_payments (domain alias settlement_payments)" as const;

export const FINANCE_FR5_PILOT_ONE_SHOT_LIVE_COMMAND = [
  "FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY=1",
  "FINANCE_WRITE_ENABLED=true",
  "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
  "PRODUCTION_WRITE_ENABLED=false",
  "DRIVER_WRITE_ENABLED=false",
  "AGENT_WRITE_ENABLED=false",
  "CUSTOMER_WRITE_ENABLED=false",
  `EXPECTED_PROJECT_ID=${FINANCE_FR5_EXPECTED_PROJECT_ID}`,
  `GOOGLE_CLOUD_PROJECT=${FINANCE_FR5_EXPECTED_PROJECT_ID}`,
  "SOURCE=fr4_settlement_locked",
  "FIREBASE_ID_TOKEN='…'",
  "npx vitest run src/test/live/finance-fr5-settlement-execution-pilot-apply.test.ts",
].join(" \\\n  ");

export const FINANCE_FR5_PILOT_CLEANUP_COMMAND = [
  "unset FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN SOURCE",
  "export FINANCE_WRITE_ENABLED=false",
  "export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false",
  "export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false",
].join(" && \\\n  ");
