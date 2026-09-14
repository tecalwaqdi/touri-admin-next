/**
 * Finance FR6 Adjustments / Corrections pilot — constants.
 * Preparation only. FINANCE_WRITE_ENABLED stays false until a separate armed live session.
 *
 * Live GO path (only): append-only adjustment create+approve against FR1–FR5 synthetic chain.
 * Live NO-GO on this cash DRIVER_PAYS_COMPANY chain: customer refund, chargeback, payment reverse
 * (would invent gateway capability or mutate settled history).
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
import { FINANCE_FR5_PAYMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr5PilotConstants";

export const FINANCE_FR6_ADJUSTMENT_PILOT_APPLY_ENV =
  "FINANCE_FR6_ADJUSTMENT_PILOT_APPLY" as const;

export const FINANCE_FR6_EXPECTED_PROJECT_ID = FINANCE_FR1_EXPECTED_PROJECT_ID;
export const FINANCE_FR6_EXPECTED_ADC_PRINCIPAL =
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;

export const FINANCE_FR6_ADJUSTMENT_COLLECTION = "finance_adjustments" as const;
export const FINANCE_FR6_AUDIT_COLLECTION = FINANCE_FR1_AUDIT_COLLECTION;
export const FINANCE_FR6_IDEMPOTENCY_COLLECTION =
  FINANCE_FR1_IDEMPOTENCY_COLLECTION;

export const FINANCE_FR6_SOURCE_SNAPSHOT_COLLECTION =
  FINANCE_FR1_SNAPSHOT_COLLECTION;
export const FINANCE_FR6_SOURCE_SNAPSHOT_ID = FINANCE_FR2_SOURCE_SNAPSHOT_ID;
export const FINANCE_FR6_SETTLEMENT_COLLECTION =
  FINANCE_FR2_SETTLEMENT_COLLECTION;
export const FINANCE_FR6_SETTLEMENT_DOC_ID = FINANCE_FR2_SETTLEMENT_DOC_ID;
export const FINANCE_FR6_PAYMENT_DOC_ID = FINANCE_FR5_PAYMENT_DOC_ID;
export const FINANCE_FR6_SOURCE_ORDER_ID = FINANCE_FR1_SYNTHETIC_ORDER_ID;

export const FINANCE_FR6_ADJUSTMENT_DOC_ID =
  "test_adminnext_finance_fr6_adjustment_001" as const;

export const FINANCE_FR6_PILOT_CLIENT_KEY =
  "finance_fr6_adjustment_pilot_v1" as const;

export const FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID =
  "finance_fr6_adjustment_pilot_v1" as const;

/** Bounded synthetic memo adjustment — does not reopen settlement. */
export const FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR = "25" as const;
export const FINANCE_FR6_ADJUSTMENT_CURRENCY = "SAR" as const;
export const FINANCE_FR6_ADJUSTMENT_DIRECTION =
  "neutral_memo" as const;
export const FINANCE_FR6_ADJUSTMENT_REASON =
  "fr6_synthetic_append_only_memo_correction" as const;
export const FINANCE_FR6_ADJUSTMENT_RESPONSIBLE_PARTY = "company" as const;

export const FINANCE_FR6_ALLOWED_WRITE_COLLECTIONS = [
  FINANCE_FR6_ADJUSTMENT_COLLECTION,
  FINANCE_FR6_AUDIT_COLLECTION,
  FINANCE_FR6_IDEMPOTENCY_COLLECTION,
] as const;

export const FINANCE_FR6_FORBIDDEN_WRITE_COLLECTIONS = [
  "order",
  "finance_accounting_snapshots",
  "financial_settlements",
  "financial_settlement_payments",
  "settlement_payments",
  "settlement_payment_intents",
  "finance_payout_preparations",
  "finance_refund_accounting",
  "finance_chargeback_accounting",
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
 * First successful FR6 adjustment create+approve apply:
 * 1 adjustment CREATE (approved final) + 2 audit (intent+result) + 1 idempotency.
 * Atomic dual-control: preparer fields + approver fields persisted once as approved.
 */
export const FINANCE_FR6_EXPECTED_WRITE_COUNTS = {
  finance_adjustments: 1,
  finance_audit_events: 2,
  admin_next_cw_idempotency: 1,
  financial_settlements: 0,
  settlement_payments: 0,
  finance_accounting_snapshots: 0,
  finance_refund_accounting: 0,
  finance_chargeback_accounting: 0,
  order: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 4,
} as const;

export const FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS = {
  finance_adjustments: 0,
  finance_audit_events: 0,
  admin_next_cw_idempotency: 0,
  financial_settlements: 0,
  settlement_payments: 0,
  finance_accounting_snapshots: 0,
  finance_refund_accounting: 0,
  finance_chargeback_accounting: 0,
  order: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 0,
} as const;

export const FINANCE_FR6_ZERO_WRITE_COUNTS =
  FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS;

export const FINANCE_FR6_ADJUSTMENT_PILOT_PASS =
  "FINANCE_FR6_ADJUSTMENT_PILOT_PASS" as const;

export const FINANCE_FR6_APPLY_SAFE_SUMMARY_PATH =
  ".local/finance-fr6-pilot/apply-safe-summary.json" as const;

export const FINANCE_FR6_PREP_SAFE_SUMMARY_PATH =
  ".local/finance-fr6-pilot/prep-safe-summary.json" as const;

export const FINANCE_FR6_EXACT_TRANSITION =
  "append-only finance_adjustments draft→approved (atomic approved write; no settlement reopen)" as const;

export const FINANCE_FR6_CANONICAL_MECHANISM =
  "AdjustmentCommandService.create + approve (RBAC finance:adjust / finance:adjust_approve; SoD); append-only finance_adjustments; FR1 snapshot + Settlement V2 payment history immutable" as const;

export const FINANCE_FR6_LIVE_PATH_DECISIONS = {
  adjustment_append_only: "GO",
  payment_reverse_on_settled: "NO-GO",
  customer_refund_on_cash_chain: "NO-GO",
  chargeback_without_gateway: "NO-GO",
} as const;

export const FINANCE_FR6_REQUIRED_RBAC_CREATE = "finance:adjust" as const;
export const FINANCE_FR6_REQUIRED_RBAC_APPROVE =
  "finance:adjust_approve" as const;

export const FINANCE_FR6_PILOT_ONE_SHOT_LIVE_COMMAND = [
  "FINANCE_FR6_ADJUSTMENT_PILOT_APPLY=1",
  "FINANCE_WRITE_ENABLED=true",
  "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
  "PRODUCTION_WRITE_ENABLED=false",
  "DRIVER_WRITE_ENABLED=false",
  "AGENT_WRITE_ENABLED=false",
  "CUSTOMER_WRITE_ENABLED=false",
  `EXPECTED_PROJECT_ID=${FINANCE_FR6_EXPECTED_PROJECT_ID}`,
  `GOOGLE_CLOUD_PROJECT=${FINANCE_FR6_EXPECTED_PROJECT_ID}`,
  "SOURCE=fr5_settlement_settled",
  "FIREBASE_ID_TOKEN='…'",
  "npx vitest run src/test/live/finance-fr6-adjustment-pilot-apply.test.ts",
].join(" \\\n  ");

export const FINANCE_FR6_PILOT_CLEANUP_COMMAND = [
  "unset FINANCE_FR6_ADJUSTMENT_PILOT_APPLY FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN SOURCE",
  "export FINANCE_WRITE_ENABLED=false",
  "export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false",
  "export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false",
].join(" && \\\n  ");
