/**
 * Finance FR7 Reporting / Read Models pilot — constants.
 * READ-ONLY computed models. Production writes = 0.
 * Prefer no new reporting table; no invent third book.
 */

import {
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  FINANCE_FR2_SETTLEMENT_COLLECTION,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import {
  FINANCE_FR5_PAYMENT_COLLECTION,
  FINANCE_FR5_PAYMENT_DOC_ID,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import {
  FINANCE_FR6_ADJUSTMENT_COLLECTION,
  FINANCE_FR6_ADJUSTMENT_DOC_ID,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";

export const FINANCE_FR7_REPORTING_PILOT_VERIFY_ENV =
  "FINANCE_FR7_REPORTING_PILOT_VERIFY" as const;

export const FINANCE_FR7_EXPECTED_PROJECT_ID = FINANCE_FR1_EXPECTED_PROJECT_ID;
export const FINANCE_FR7_EXPECTED_ADC_PRINCIPAL =
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;

export const FINANCE_FR7_SNAPSHOT_COLLECTION = FINANCE_FR1_SNAPSHOT_COLLECTION;
export const FINANCE_FR7_SETTLEMENT_COLLECTION =
  FINANCE_FR2_SETTLEMENT_COLLECTION;
export const FINANCE_FR7_PAYMENT_COLLECTION = FINANCE_FR5_PAYMENT_COLLECTION;
export const FINANCE_FR7_ADJUSTMENT_COLLECTION =
  FINANCE_FR6_ADJUSTMENT_COLLECTION;
export const FINANCE_FR7_IDEMPOTENCY_COLLECTION =
  FINANCE_FR1_IDEMPOTENCY_COLLECTION;

export const FINANCE_FR7_SOURCE_SNAPSHOT_ID = FINANCE_FR2_SOURCE_SNAPSHOT_ID;
export const FINANCE_FR7_SETTLEMENT_DOC_ID = FINANCE_FR2_SETTLEMENT_DOC_ID;
export const FINANCE_FR7_PAYMENT_DOC_ID = FINANCE_FR5_PAYMENT_DOC_ID;
export const FINANCE_FR7_ADJUSTMENT_DOC_ID = FINANCE_FR6_ADJUSTMENT_DOC_ID;
export const FINANCE_FR7_SOURCE_ORDER_ID = FINANCE_FR1_SYNTHETIC_ORDER_ID;

export const FINANCE_FR7_PILOT_CLIENT_KEY =
  "finance_fr7_reporting_pilot_v1" as const;

/** Read-only computed — no reporting table invented for FR7. */
export const FINANCE_FR7_PERSISTENCE_MODE =
  "read_only_computed_models" as const;

export const FINANCE_FR7_EXPECTED_WRITE_COUNTS = {
  finance_reporting_tables: 0,
  finance_accounting_snapshots: 0,
  financial_settlements: 0,
  financial_settlement_payments: 0,
  finance_adjustments: 0,
  finance_refund_accounting: 0,
  finance_chargeback_accounting: 0,
  finance_reconciliation_runs: 0,
  finance_audit_events: 0,
  admin_next_cw_idempotency: 0,
  order: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 0,
} as const;

export const FINANCE_FR7_ZERO_WRITE_COUNTS = FINANCE_FR7_EXPECTED_WRITE_COUNTS;

export const FINANCE_FR7_ALLOWED_WRITE_COLLECTIONS = [] as const;

export const FINANCE_FR7_FORBIDDEN_WRITE_COLLECTIONS = [
  "order",
  "finance_accounting_snapshots",
  "financial_settlements",
  "financial_settlement_payments",
  "settlement_payments",
  "settlement_payment_intents",
  "finance_payout_preparations",
  "finance_refund_accounting",
  "finance_chargeback_accounting",
  "finance_adjustments",
  "finance_reconciliation_runs",
  "finance_audit_events",
  "admin_next_cw_idempotency",
  "finance_reporting_aggregates",
  "users",
  "user",
  "drivers",
  "agents",
  "customers",
] as const;

export const FINANCE_FR7_AUTHORITATIVE_SOURCE_COLLECTIONS = [
  "finance_accounting_snapshots",
  "financial_settlements",
  "financial_settlement_payments",
  "finance_adjustments",
  "finance_refund_accounting",
  "finance_chargeback_accounting",
  "finance_payout_preparations",
] as const;

export const FINANCE_FR7_REPORTING_PILOT_PASS =
  "FINANCE_FR7_REPORTING_PILOT_PASS" as const;

export const FINANCE_FR7_PREP_SAFE_SUMMARY_PATH =
  ".local/finance-fr7-pilot/prep-safe-summary.json" as const;

export const FINANCE_FR7_VERIFY_SAFE_SUMMARY_PATH =
  ".local/finance-fr7-pilot/verify-safe-summary.json" as const;

export const FINANCE_FR7_PILOT_ONE_SHOT_LIVE_READ_COMMAND = [
  "FINANCE_FR7_REPORTING_PILOT_VERIFY=1",
  "FINANCE_WRITE_ENABLED=false",
  "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
  "PRODUCTION_WRITE_ENABLED=false",
  "DRIVER_WRITE_ENABLED=false",
  "AGENT_WRITE_ENABLED=false",
  "CUSTOMER_WRITE_ENABLED=false",
  `EXPECTED_PROJECT_ID=${FINANCE_FR7_EXPECTED_PROJECT_ID}`,
  `GOOGLE_CLOUD_PROJECT=${FINANCE_FR7_EXPECTED_PROJECT_ID}`,
  "SOURCE=fr1_fr6_read_only",
  "FIREBASE_ID_TOKEN='…'",
  "# read-only verify — totalProductionWrites=0; ADC info@touri-taxi.com",
  "npx vitest run src/test/live/finance-fr7-reporting-pilot-verify.test.ts",
].join(" \\\n  ");

export const FINANCE_FR7_PILOT_CLEANUP_COMMAND = [
  "unset FINANCE_FR7_REPORTING_PILOT_VERIFY FIREBASE_ID_TOKEN SOURCE",
  "export FINANCE_WRITE_ENABLED=false",
  "export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false",
  "export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false",
].join(" && \\\n  ");

/** Golden monetary totals before FR6 memo impact (memo does not alter money). */
export const FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS = {
  currency: "SAR",
  grossFareMinor: "10000",
  companyCommissionMinor: "1500",
  driverNetMinor: "8500",
  settlementAmountMinor: "1500",
  paidConfirmedMinor: "1500",
  outstandingMinor: "0",
  settlementStatus: "settled",
  settlementDirection: "DRIVER_PAYS_COMPANY",
  reconciliationStatus: "PASS",
} as const;
