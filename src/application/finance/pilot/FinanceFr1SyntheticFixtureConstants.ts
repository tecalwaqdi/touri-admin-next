/**
 * FR1 synthetic completed-trip Finance fixture — constants / IDs / write counts.
 * PREPARATION ONLY. Production writes = 0 this session.
 * FINANCE_WRITE_ENABLED must remain false.
 */

import { FINANCE_FR1_EXPECTED_ADC_PRINCIPAL } from "@/application/finance/pilot/FinanceFr1PilotConstants";
import { FINANCE_FR1_EXPECTED_PROJECT_ID } from "@/application/finance/pilot/FinanceFr1PilotConstants";

export const FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_ENV =
  "FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE" as const;

export const FINANCE_FR1_SYNTHETIC_FIXTURE_DRY_RUN_ENV =
  "FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE_DRY_RUN" as const;

/**
 * Required to consume registry fixtures as Finance canonical input.
 * Absent → normal Production Finance services MUST reject registry-backed input.
 */
export const FINANCE_FR1_REGISTRY_PILOT_ENV =
  "FINANCE_FR1_REGISTRY_PILOT" as const;

/** RO verification harness arm (SKIP default). */
export const FINANCE_FR1_REGISTRY_FIXTURE_VERIFY_ENV =
  "FINANCE_FR1_REGISTRY_FIXTURE_VERIFY" as const;

/** Dedicated synthetic order id — proven test_ prefix for FR1 classifier. */
export const FINANCE_FR1_SYNTHETIC_ORDER_ID =
  "test_adminnext_finance_fr1_completed_001" as const;

/**
 * Isolated trigger-free registry collection (no Legacy CF listeners found).
 * Holds exact legacy order payload for FR1 discovery bridge — does NOT write `order/`.
 */
export const FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION =
  "admin_next_finance_fr1_order_fixtures" as const;

export const FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID =
  FINANCE_FR1_SYNTHETIC_ORDER_ID;

export const FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY =
  "finance_fr1_create_synthetic_completed_order_fixture_v1" as const;

export const FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID =
  FINANCE_FR1_EXPECTED_PROJECT_ID;

export const FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL =
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;

/** Prep / this session — all zero. */
export const FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION = {
  order: 0,
  admin_next_finance_fr1_order_fixtures: 0,
  finance_accounting_snapshots: 0,
  finance_audit_events: 0,
  admin_next_cw_idempotency: 0,
  financial_settlements: 0,
  settlement_payments: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  user: 0,
  triggerSideEffectWrites: 0,
  totalProductionWrites: 0,
} as const;

/**
 * Future armed registry-only create (isolated safe path).
 * order writes remain 0 — payload lives in trigger-free registry.
 */
export const FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE = {
  order: 0,
  admin_next_finance_fr1_order_fixtures: 1,
  finance_accounting_snapshots: 0,
  finance_audit_events: 0,
  admin_next_cw_idempotency: 1,
  financial_settlements: 0,
  settlement_payments: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  user: 0,
  triggerSideEffectWrites: 0,
  totalProductionWrites: 2,
} as const;

/**
 * Direct `order/{id}` Admin SDK create — REFUSED (ORDER_TRIGGER_INSPECTION=NO-GO).
 * Counts listed only to document uncontrolled side-effect surface.
 */
export const FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_ORDER_CREATE_REFUSED = {
  order: 1,
  admin_next_finance_fr1_order_fixtures: 0,
  finance_accounting_snapshots: 0,
  finance_audit_events: 0,
  admin_next_cw_idempotency: 0,
  financial_settlements: 0,
  settlement_payments: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  user: "0..N_fcm_token_cleanup",
  triggerSideEffectWrites:
    "1_agent_snapshot_merge_unless_preseeded + FCM_external",
  totalProductionWrites: "uncontrolled_NO_GO",
} as const;

export const FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM = [
  "datastore.entities.get",
  "datastore.entities.create",
] as const;

export const FINANCE_FR1_SYNTHETIC_FIXTURE_FORBIDDEN_IAM = [
  "firebaseauth.users.create",
  "firebaseauth.users.update",
  "firebaseauth.users.delete",
] as const;

/** Success marker for live one-shot registry fixture provision. */
export const FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS =
  "FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS" as const;

export const FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_OP =
  "finance_fr1_create_synthetic_completed_order_fixture" as const;

export const FINANCE_FR1_SYNTHETIC_FIXTURE_CLEANUP_COMMAND = [
  "unset FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE TARGET IDEMPOTENCY_KEY DOCUMENT_ID",
  "export FINANCE_WRITE_ENABLED=false",
  "export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false",
  "export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false",
  "# Manual Firestore delete ONLY if unused (no finance_accounting_snapshots/" +
    "test_adminnext_finance_fr1_completed_001):",
  "#   admin_next_finance_fr1_order_fixtures/test_adminnext_finance_fr1_completed_001",
  "#   admin_next_cw_idempotency/finance_fr1_create_synthetic_completed_order_fixture_v1",
].join(" && \\\n  ");

export const FINANCE_FR1_SYNTHETIC_FIXTURE_SAFE_SUMMARY_PATH =
  ".local/finance-fr1-pilot/fixture-provision-safe-summary.json" as const;
