/**
 * Finance FR3 Reconciliation pilot — constants.
 * Design F3 / D-10 / RunReconciliation: shadow compare, read-only (write run doc later).
 * Do NOT invent Production finance_reconciliation_runs persistence for this pilot.
 * FINANCE_WRITE_ENABLED stays false. Production writes = 0.
 */

import {
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
  FINANCE_FR1_AUDIT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  FINANCE_FR2_IDEMPOTENCY_COLLECTION,
  FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR2_SETTLEMENT_COLLECTION,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";

export const FINANCE_FR3_RECON_PILOT_VERIFY_ENV =
  "FINANCE_FR3_RECON_PILOT_VERIFY" as const;

export const FINANCE_FR3_EXPECTED_PROJECT_ID = FINANCE_FR1_EXPECTED_PROJECT_ID;

export const FINANCE_FR3_EXPECTED_ADC_PRINCIPAL =
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;

export const FINANCE_FR3_SNAPSHOT_COLLECTION = FINANCE_FR1_SNAPSHOT_COLLECTION;
export const FINANCE_FR3_SETTLEMENT_COLLECTION =
  FINANCE_FR2_SETTLEMENT_COLLECTION;
export const FINANCE_FR3_AUDIT_COLLECTION = FINANCE_FR1_AUDIT_COLLECTION;
export const FINANCE_FR3_IDEMPOTENCY_COLLECTION =
  FINANCE_FR1_IDEMPOTENCY_COLLECTION;

export const FINANCE_FR3_SOURCE_SNAPSHOT_ID = FINANCE_FR2_SOURCE_SNAPSHOT_ID;
export const FINANCE_FR3_SETTLEMENT_DOC_ID = FINANCE_FR2_SETTLEMENT_DOC_ID;
export const FINANCE_FR3_SOURCE_ORDER_ID = FINANCE_FR1_SYNTHETIC_ORDER_ID;

export const FINANCE_FR3_FR1_IDEMPOTENCY_DOC_ID =
  FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID;
export const FINANCE_FR3_FR2_IDEMPOTENCY_DOC_ID =
  FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID;
export const FINANCE_FR3_FR2_IDEMPOTENCY_COLLECTION =
  FINANCE_FR2_IDEMPOTENCY_COLLECTION;

export const FINANCE_FR3_PILOT_CLIENT_KEY =
  "finance_fr3_reconciliation_pilot_v1" as const;

/** Persistence mode locked by F1–F6 design inspection. */
export const FINANCE_FR3_PERSISTENCE_MODE = "read_only_shadow" as const;

/**
 * Read-only FR3 — no Production writes.
 * finance_reconciliation_runs remains Fake/offline until a separate Production GO.
 */
export const FINANCE_FR3_EXPECTED_WRITE_COUNTS = {
  finance_reconciliation_runs: 0,
  finance_audit_events: 0,
  admin_next_cw_idempotency: 0,
  finance_accounting_snapshots: 0,
  financial_settlements: 0,
  settlement_payments: 0,
  order: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 0,
} as const;

export const FINANCE_FR3_ZERO_WRITE_COUNTS = FINANCE_FR3_EXPECTED_WRITE_COUNTS;

export const FINANCE_FR3_ALLOWED_WRITE_COLLECTIONS = [] as const;

export const FINANCE_FR3_FORBIDDEN_WRITE_COLLECTIONS = [
  "order",
  "finance_accounting_snapshots",
  "financial_settlements",
  "settlement_payments",
  "settlement_payment_intents",
  "finance_payout_preparations",
  "finance_refund_accounting",
  "finance_adjustments",
  "finance_reconciliation_runs",
  "finance_audit_events",
  "admin_next_cw_idempotency",
  "users",
  "user",
  "drivers",
  "agents",
  "customers",
] as const;

export const FINANCE_FR3_RECON_PILOT_PASS =
  "FINANCE_FR3_RECON_PILOT_PASS" as const;

export const FINANCE_FR3_PREP_SAFE_SUMMARY_PATH =
  ".local/finance-fr3-pilot/prep-safe-summary.json" as const;

export const FINANCE_FR3_VERIFY_SAFE_SUMMARY_PATH =
  ".local/finance-fr3-pilot/verify-safe-summary.json" as const;

/**
 * Optional future live *read* verify (not a write harness).
 * Persistence not required by design — no apply arm.
 */
export const FINANCE_FR3_PILOT_ONE_SHOT_LIVE_READ_COMMAND = [
  "FINANCE_FR3_RECON_PILOT_VERIFY=1",
  "FINANCE_WRITE_ENABLED=false",
  "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
  "PRODUCTION_WRITE_ENABLED=false",
  "DRIVER_WRITE_ENABLED=false",
  "AGENT_WRITE_ENABLED=false",
  "CUSTOMER_WRITE_ENABLED=false",
  `EXPECTED_PROJECT_ID=${FINANCE_FR3_EXPECTED_PROJECT_ID}`,
  `GOOGLE_CLOUD_PROJECT=${FINANCE_FR3_EXPECTED_PROJECT_ID}`,
  "SOURCE=fr1_fr2_read_only",
  "FIREBASE_ID_TOKEN='…'",
  "# read-only verify — no write harness (persistence not required by design)",
  "npx vitest run src/test/live/finance-fr3-reconciliation-pilot-verify.test.ts",
].join(" \\\n  ");

export const FINANCE_FR3_PILOT_CLEANUP_COMMAND = [
  "unset FINANCE_FR3_RECON_PILOT_VERIFY FIREBASE_ID_TOKEN SOURCE",
  "export FINANCE_WRITE_ENABLED=false",
  "export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false",
  "export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false",
].join(" && \\\n  ");
