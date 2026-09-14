/**
 * Finance FR1 pilot — constants / collections / project fingerprint.
 * Preparation only. FINANCE_WRITE_ENABLED stays false until a separate armed live session.
 */

export const FINANCE_FR1_PILOT_APPLY_ENV = "FINANCE_FR1_PILOT_APPLY" as const;

export const FINANCE_FR1_EXPECTED_PROJECT_ID =
  "tutorial-multi-language-70gx4j" as const;

export const FINANCE_FR1_EXPECTED_ADC_PRINCIPAL =
  "info@touri-taxi.com" as const;

export const FINANCE_FR1_SNAPSHOT_COLLECTION =
  "finance_accounting_snapshots" as const;

export const FINANCE_FR1_AUDIT_COLLECTION = "finance_audit_events" as const;

export const FINANCE_FR1_IDEMPOTENCY_COLLECTION =
  "admin_next_cw_idempotency" as const;

export const FINANCE_FR1_PILOT_CLIENT_KEY =
  "finance_fr1_accounting_snapshot_pilot_v1" as const;

export const FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID =
  "finance_fr1_accounting_snapshot_pilot_v1" as const;

/** Exact resource allowlist for FR1 pilot writes. */
export const FINANCE_FR1_ALLOWED_WRITE_COLLECTIONS = [
  FINANCE_FR1_SNAPSHOT_COLLECTION,
  FINANCE_FR1_AUDIT_COLLECTION,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
] as const;

export const FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS = [
  "order",
  "financial_settlements",
  "settlement_payments",
  "users",
  "user",
  "drivers",
  "agents",
  "customers",
  "finance_refund_accounting",
  "finance_adjustments",
] as const;

/** Expected write counts for a first successful FR1 apply (not this prep session). */
export const FINANCE_FR1_EXPECTED_WRITE_COUNTS = {
  finance_accounting_snapshots: 1,
  finance_audit_events: 2, // intent + result
  admin_next_cw_idempotency: 1,
  order: 0,
  financial_settlements: 0,
  settlement_payments: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 4,
} as const;

export const FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS = {
  finance_accounting_snapshots: 0,
  finance_audit_events: 0,
  admin_next_cw_idempotency: 0,
  order: 0,
  financial_settlements: 0,
  settlement_payments: 0,
  drivers: 0,
  agents: 0,
  customers: 0,
  totalProductionWrites: 0,
} as const;

export const FINANCE_FR1_ZERO_WRITE_COUNTS =
  FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS;

/** Success marker for live one-shot FR1 Finance pilot apply. */
export const FINANCE_FR1_PILOT_PASS = "FINANCE_FR1_PILOT_PASS" as const;

export const FINANCE_FR1_APPLY_SAFE_SUMMARY_PATH =
  ".local/finance-fr1-pilot/apply-safe-summary.json" as const;

export const FINANCE_FR1_PILOT_ONE_SHOT_LIVE_COMMAND = [
  "FINANCE_FR1_PILOT_APPLY=1",
  "FINANCE_FR1_REGISTRY_PILOT=1",
  "FINANCE_WRITE_ENABLED=true",
  "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
  "PRODUCTION_WRITE_ENABLED=false",
  "DRIVER_WRITE_ENABLED=false",
  "AGENT_WRITE_ENABLED=false",
  "CUSTOMER_WRITE_ENABLED=false",
  `EXPECTED_PROJECT_ID=${FINANCE_FR1_EXPECTED_PROJECT_ID}`,
  `GOOGLE_CLOUD_PROJECT=${FINANCE_FR1_EXPECTED_PROJECT_ID}`,
  "SOURCE=registry",
  "FIREBASE_ID_TOKEN='…'",
  "npx vitest run src/test/live/finance-fr1-pilot-apply.test.ts",
].join(" \\\n  ");

export const FINANCE_FR1_PILOT_CLEANUP_COMMAND = [
  "unset FINANCE_FR1_PILOT_APPLY FINANCE_FR1_REGISTRY_PILOT FINANCE_WRITE_ENABLED FIREBASE_ID_TOKEN SOURCE",
  "export FINANCE_WRITE_ENABLED=false",
  "export GLOBAL_PRODUCTION_WRITE_ENABLED=false PRODUCTION_WRITE_ENABLED=false",
  "export DRIVER_WRITE_ENABLED=false AGENT_WRITE_ENABLED=false CUSTOMER_WRITE_ENABLED=false",
].join(" && \\\n  ");
