/**
 * Finance FR4 Settlement Approval pilot — constants / collections / project fingerprint.
 * Preparation only. FINANCE_WRITE_ENABLED stays false until a separate armed live session.
 * Input SoT: proven FR2 Settlement V2 draft only (reuse; no second settlement).
 * Approval = V2 lock (draft → locked); ops/display label = approved.
 * Distinct from payout / execute.
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
  FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR2_SETTLEMENT_COLLECTION,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";

export const FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY_ENV =
  "FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY" as const;

export const FINANCE_FR4_EXPECTED_PROJECT_ID = FINANCE_FR1_EXPECTED_PROJECT_ID;

export const FINANCE_FR4_EXPECTED_ADC_PRINCIPAL =
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;

export const FINANCE_FR4_SETTLEMENT_COLLECTION =
  FINANCE_FR2_SETTLEMENT_COLLECTION;

export const FINANCE_FR4_AUDIT_COLLECTION = FINANCE_FR1_AUDIT_COLLECTION;

export const FINANCE_FR4_IDEMPOTENCY_COLLECTION =
  FINANCE_FR1_IDEMPOTENCY_COLLECTION;

/** FR1/FR2 — read-only preconditions (never mutate). */
export const FINANCE_FR4_SOURCE_SNAPSHOT_COLLECTION =
  FINANCE_FR1_SNAPSHOT_COLLECTION;
export const FINANCE_FR4_SOURCE_SNAPSHOT_ID = FINANCE_FR2_SOURCE_SNAPSHOT_ID;
export const FINANCE_FR4_SETTLEMENT_DOC_ID = FINANCE_FR2_SETTLEMENT_DOC_ID;
export const FINANCE_FR4_FR2_IDEMPOTENCY_DOC_ID =
  FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID;
export const FINANCE_FR4_SOURCE_ORDER_ID = FINANCE_FR1_SYNTHETIC_ORDER_ID;

export const FINANCE_FR4_PILOT_CLIENT_KEY =
  "finance_fr4_settlement_approval_pilot_v1" as const;

export const FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID =
  "finance_fr4_settlement_approval_pilot_v1" as const;

/** Exact resource allowlist for FR4 pilot writes. */
export const FINANCE_FR4_ALLOWED_WRITE_COLLECTIONS = [
  FINANCE_FR4_SETTLEMENT_COLLECTION,
  FINANCE_FR4_AUDIT_COLLECTION,
  FINANCE_FR4_IDEMPOTENCY_COLLECTION,
] as const;

export const FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS = [
  "order",
  "finance_accounting_snapshots",
  "settlement_payments",
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
] as const;

/**
 * Expected write counts for a first successful FR4 approval apply
 * (not this prep session): 1 settlement UPDATE + 2 audit creates + 1 idempotency.
 */
export const FINANCE_FR4_EXPECTED_WRITE_COUNTS = {
  financial_settlements: 1, // update only
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

export const FINANCE_FR4_ALREADY_APPLIED_WRITE_COUNTS = {
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

export const FINANCE_FR4_ZERO_WRITE_COUNTS =
  FINANCE_FR4_ALREADY_APPLIED_WRITE_COUNTS;

/** Success marker for live one-shot FR4 Settlement Approval pilot apply. */
export const FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS =
  "FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS" as const;

export const FINANCE_FR4_APPLY_SAFE_SUMMARY_PATH =
  ".local/finance-fr4-pilot/apply-safe-summary.json" as const;

export const FINANCE_FR4_PREP_SAFE_SUMMARY_PATH =
  ".local/finance-fr4-pilot/prep-safe-summary.json" as const;

/** V2 Production status after approval (ops/display maps locked → approved). */
export const FINANCE_FR4_POST_APPROVAL_STATUS = "locked" as const;

/** Ops/display label for FR4 approval outcome. */
export const FINANCE_FR4_OPS_APPROVAL_LABEL = "approved" as const;

export const FINANCE_FR4_EXACT_TRANSITION =
  "draft → locked (= approved)" as const;

/** Allowed settlement field mutations only (immutable amount/currency/direction/source). */
export const FINANCE_FR4_ALLOWED_SETTLEMENT_FIELD_MUTATIONS = [
  "status",
  "lockedByUserId",
  "lockedAtUtc",
  "approvedAt",
  "approvedBy",
  "approvalCorrelationId",
  "updatedAtUtc",
] as const;

export const FINANCE_FR4_REQUIRED_RBAC_PERMISSION = "settlements:approve" as const;

export const FINANCE_FR4_PILOT_ONE_SHOT_LIVE_COMMAND = [
  "FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY=1",
  "FINANCE_WRITE_ENABLED=true",
  "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
  "PRODUCTION_WRITE_ENABLED=false",
  "DRIVER_WRITE_ENABLED=false",
  "AGENT_WRITE_ENABLED=false",
  "CUSTOMER_WRITE_ENABLED=false",
  `EXPECTED_PROJECT_ID=${FINANCE_FR4_EXPECTED_PROJECT_ID}`,
  `GOOGLE_CLOUD_PROJECT=${FINANCE_FR4_EXPECTED_PROJECT_ID}`,
  "SOURCE=fr2_settlement_draft",
  "FIREBASE_ID_TOKEN='…'",
  "npx vitest run src/test/live/finance-fr4-settlement-approval-pilot-apply.test.ts",
].join(" \\\n  ");

export const FINANCE_FR4_PILOT_CLEANUP_COMMAND = [
  "unset FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN SOURCE",
  "export FINANCE_WRITE_ENABLED=false",
  "export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false",
  "export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false",
].join(" && \\\n  ");
