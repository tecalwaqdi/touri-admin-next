/**
 * Finance FR2 Settlement V2 pilot — constants / collections / project fingerprint.
 * Preparation only. FINANCE_WRITE_ENABLED stays false until a separate armed live session.
 * Input SoT: FR1 finance_accounting_snapshots only (no real trips; no third book).
 */

import {
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
  FINANCE_FR1_AUDIT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  FINANCE_FR1_FIXTURE_COUNTRY_ID,
  FINANCE_FR1_FIXTURE_SYNTHETIC_DRIVER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";

export const FINANCE_FR2_SETTLEMENT_PILOT_APPLY_ENV =
  "FINANCE_FR2_SETTLEMENT_PILOT_APPLY" as const;

export const FINANCE_FR2_EXPECTED_PROJECT_ID = FINANCE_FR1_EXPECTED_PROJECT_ID;

export const FINANCE_FR2_EXPECTED_ADC_PRINCIPAL =
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;

export const FINANCE_FR2_SETTLEMENT_COLLECTION =
  "financial_settlements" as const;

export const FINANCE_FR2_AUDIT_COLLECTION = FINANCE_FR1_AUDIT_COLLECTION;

export const FINANCE_FR2_IDEMPOTENCY_COLLECTION =
  FINANCE_FR1_IDEMPOTENCY_COLLECTION;

/** FR1 snapshot / idempotency — read-only preconditions (never mutate). */
export const FINANCE_FR2_SOURCE_SNAPSHOT_COLLECTION =
  FINANCE_FR1_SNAPSHOT_COLLECTION;
export const FINANCE_FR2_SOURCE_SNAPSHOT_ID = FINANCE_FR1_SYNTHETIC_ORDER_ID;
export const FINANCE_FR2_SOURCE_FR1_IDEMPOTENCY_DOC_ID =
  FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID;

export const FINANCE_FR2_PILOT_CLIENT_KEY =
  "finance_fr2_settlement_v2_pilot_v1" as const;

export const FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID =
  "finance_fr2_settlement_v2_pilot_v1" as const;

/** Deterministic create-only Settlement V2 draft id for this pilot. */
export const FINANCE_FR2_SETTLEMENT_DOC_ID =
  "test_adminnext_finance_fr2_settlement_v2_001" as const;

export const FINANCE_FR2_CLAIM_LINE_ID =
  `drv_line_${FINANCE_FR1_SYNTHETIC_ORDER_ID}` as const;

export const FINANCE_FR2_PARTY_TYPE = "driver" as const;
export const FINANCE_FR2_PARTY_ID = FINANCE_FR1_FIXTURE_SYNTHETIC_DRIVER_ID;
export const FINANCE_FR2_COUNTRY_ID = FINANCE_FR1_FIXTURE_COUNTRY_ID;

export const FINANCE_FR2_PERIOD_FROM_UTC = "2026-09-13T00:00:00.000Z" as const;
export const FINANCE_FR2_PERIOD_TO_UTC = "2026-09-13T23:59:59.999Z" as const;

/** Exact resource allowlist for FR2 pilot writes. */
export const FINANCE_FR2_ALLOWED_WRITE_COLLECTIONS = [
  FINANCE_FR2_SETTLEMENT_COLLECTION,
  FINANCE_FR2_AUDIT_COLLECTION,
  FINANCE_FR2_IDEMPOTENCY_COLLECTION,
] as const;

export const FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS = [
  "order",
  "finance_accounting_snapshots",
  "settlement_payments",
  "settlement_payment_intents",
  "finance_payout_preparations",
  "finance_refund_accounting",
  "finance_adjustments",
  "users",
  "user",
  "drivers",
  "agents",
  "customers",
  "admin_next_finance_fr1_order_fixtures",
] as const;

/** Expected write counts for a first successful FR2 apply (not this prep session). */
export const FINANCE_FR2_EXPECTED_WRITE_COUNTS = {
  financial_settlements: 1,
  finance_audit_events: 2, // intent + result
  admin_next_cw_idempotency: 1,
  finance_accounting_snapshots: 0,
  order: 0,
  settlement_payments: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 4,
} as const;

export const FINANCE_FR2_ALREADY_APPLIED_WRITE_COUNTS = {
  financial_settlements: 0,
  finance_audit_events: 0,
  admin_next_cw_idempotency: 0,
  finance_accounting_snapshots: 0,
  order: 0,
  settlement_payments: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 0,
} as const;

export const FINANCE_FR2_ZERO_WRITE_COUNTS =
  FINANCE_FR2_ALREADY_APPLIED_WRITE_COUNTS;

/** Success marker for live one-shot FR2 Settlement V2 pilot apply. */
export const FINANCE_FR2_SETTLEMENT_PILOT_PASS =
  "FINANCE_FR2_SETTLEMENT_PILOT_PASS" as const;

export const FINANCE_FR2_APPLY_SAFE_SUMMARY_PATH =
  ".local/finance-fr2-pilot/apply-safe-summary.json" as const;

export const FINANCE_FR2_PREP_SAFE_SUMMARY_PATH =
  ".local/finance-fr2-pilot/prep-safe-summary.json" as const;

export const FINANCE_FR2_PILOT_ONE_SHOT_LIVE_COMMAND = [
  "FINANCE_FR2_SETTLEMENT_PILOT_APPLY=1",
  "FINANCE_WRITE_ENABLED=true",
  "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
  "PRODUCTION_WRITE_ENABLED=false",
  "DRIVER_WRITE_ENABLED=false",
  "AGENT_WRITE_ENABLED=false",
  "CUSTOMER_WRITE_ENABLED=false",
  `EXPECTED_PROJECT_ID=${FINANCE_FR2_EXPECTED_PROJECT_ID}`,
  `GOOGLE_CLOUD_PROJECT=${FINANCE_FR2_EXPECTED_PROJECT_ID}`,
  "SOURCE=fr1_snapshot",
  "FIREBASE_ID_TOKEN='…'",
  "npx vitest run src/test/live/finance-fr2-settlement-pilot-apply.test.ts",
].join(" \\\n  ");

export const FINANCE_FR2_PILOT_CLEANUP_COMMAND = [
  "unset FINANCE_FR2_SETTLEMENT_PILOT_APPLY FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN SOURCE",
  "export FINANCE_WRITE_ENABLED=false",
  "export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false",
  "export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false",
].join(" && \\\n  ");
