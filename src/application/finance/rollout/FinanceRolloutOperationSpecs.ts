/**
 * Controlled Finance Rollout — offline operation specs (FR1–FR7).
 * FINANCE_WRITE_ENABLED must remain false. Production writes = 0.
 * Specs define preconditions, allowed collections, write counts, etc.
 */

export const FINANCE_CONTROLLED_ROLLOUT_OPS = [
  "materialize_accounting_snapshot",
  "settlement_v2_create_update",
  "reconciliation",
  "settlement_approval",
  "settlement_execution_preparation",
  "adjustment",
  "reversal",
  "refund_accounting",
  "chargeback_accounting",
  "payout_preparation",
] as const;

export type FinanceControlledRolloutOp =
  (typeof FINANCE_CONTROLLED_ROLLOUT_OPS)[number];

export const FINANCE_ROLLOUT_PHASES = [
  "FR1",
  "FR2",
  "FR3",
  "FR4",
  "FR5",
  "FR6",
  "FR7",
] as const;

export type FinanceRolloutPhase = (typeof FINANCE_ROLLOUT_PHASES)[number];

export type FinanceRolloutOpSpec = {
  op: FinanceControlledRolloutOp;
  phase: FinanceRolloutPhase;
  description: string;
  preconditions: readonly string[];
  allowedCollections: readonly string[];
  expectedWriteCounts: {
    offlineFakeMax: number;
    production: 0;
  };
  idempotencyKeyPattern: string;
  auditActions: readonly string[];
  rollbackOrReversal: string;
  forbiddenWrites: readonly string[];
  postWriteVerification: readonly string[];
  requiredPermissions: readonly string[];
  fc01Dependent: boolean;
};

export const FINANCE_ROLLOUT_OP_SPECS: Record<
  FinanceControlledRolloutOp,
  FinanceRolloutOpSpec
> = {
  materialize_accounting_snapshot: {
    op: "materialize_accounting_snapshot",
    phase: "FR1",
    description:
      "Materialize deterministic accounting snapshot for eligible completed trip from order majors",
    preconditions: [
      "trip_lifecycle_completed",
      "currency_present",
      "persisted_majors_available_or_fail_closed",
      "actor_verified",
      "FINANCE_WRITE_ENABLED=false_for_production",
      "country_scope_matches",
    ],
    allowedCollections: [
      "finance_accounting_snapshots",
      "finance_audit_events",
    ],
    expectedWriteCounts: { offlineFakeMax: 2, production: 0 },
    idempotencyKeyPattern: "actor|snapshot.materialize|order|{orderId}|{clientKey}",
    auditActions: ["snapshot.materialize.intent", "snapshot.materialize.result"],
    rollbackOrReversal: "append-only; corrections via adjustment/reversal — never mutate snapshot in place",
    forbiddenWrites: [
      "order",
      "financial_settlements",
      "settlement_payments",
      "users",
      "drivers",
      "agents",
    ],
    postWriteVerification: [
      "snapshot_immutable_hash_stable",
      "majors_match_order_persisted",
      "missing_fields_not_zero",
      "production_writes=0",
    ],
    requiredPermissions: ["settlements:prepare", "finance:read"],
    fc01Dependent: false,
  },
  settlement_v2_create_update: {
    op: "settlement_v2_create_update",
    phase: "FR2",
    description:
      "Create/update Settlement V2 draft via Finance application services only",
    preconditions: [
      "accounting_lines_eligible",
      "single_country_currency",
      "partyType_driver_or_agent",
      "actor_verified",
      "dual_control_not_required_for_draft",
    ],
    allowedCollections: ["financial_settlements", "finance_audit_events"],
    expectedWriteCounts: { offlineFakeMax: 2, production: 0 },
    idempotencyKeyPattern: "actor|settlement.create|financial_settlements|{resource}|{clientKey}",
    auditActions: ["settlement.create", "settlement.update"],
    rollbackOrReversal: "void draft via settlements:reverse; never rewrite claims in place after lock",
    forbiddenWrites: ["order", "drivers", "agents", "customers", "direct_ui_firestore"],
    postWriteVerification: [
      "status=draft",
      "claims_currency_match",
      "cross_country_denied",
      "production_writes=0",
    ],
    requiredPermissions: ["settlements:create", "settlements:prepare"],
    fc01Dependent: false,
  },
  reconciliation: {
    op: "reconciliation",
    phase: "FR3",
    description: "Reconciliation command — compare dimensions; never second ledger",
    preconditions: [
      "period_country_currency_specified",
      "finance:read",
      "no_auto_fix_production",
    ],
    allowedCollections: ["finance_reconciliation_runs", "finance_audit_events"],
    expectedWriteCounts: { offlineFakeMax: 2, production: 0 },
    idempotencyKeyPattern: "actor|recon.run|recon|{periodKey}|{clientKey}",
    auditActions: ["recon.run"],
    rollbackOrReversal: "recon runs append-only; no ledger mutation",
    forbiddenWrites: [
      "order",
      "financial_settlements",
      "settlement_payments",
      "auto_fix_writes",
    ],
    postWriteVerification: [
      "variance_rows_present_or_empty",
      "blocker_variances_flagged",
      "production_writes=0",
    ],
    requiredPermissions: ["finance:read"],
    fc01Dependent: false,
  },
  settlement_approval: {
    op: "settlement_approval",
    phase: "FR4",
    description: "Settlement approval = V2 lock; dual control (approver ≠ creator)",
    preconditions: [
      "settlement_status=draft",
      "approver_neq_creator",
      "no_blocker_recon_variances",
      "currency_present",
    ],
    allowedCollections: ["financial_settlements", "finance_audit_events"],
    expectedWriteCounts: { offlineFakeMax: 2, production: 0 },
    idempotencyKeyPattern: "actor|settlement.lock|financial_settlements|{id}|{clientKey}",
    auditActions: ["settlement.lock"],
    rollbackOrReversal: "void before payments; post-settle use payment reverse + adjustment",
    forbiddenWrites: ["order", "in_place_claim_edit"],
    postWriteVerification: [
      "status=locked",
      "lockedByUserId_set",
      "dual_control_enforced",
      "production_writes=0",
    ],
    requiredPermissions: ["settlements:approve"],
    fc01Dependent: false,
  },
  settlement_execution_preparation: {
    op: "settlement_execution_preparation",
    phase: "FR5",
    description:
      "Prepare settlement execution / payment intents — NOT live execute / NOT live payout",
    preconditions: [
      "settlement_status=locked_or_partially_paid",
      "FINANCE_WRITE_ENABLED=false_blocks_production",
      "live_execute_forbidden_in_prep",
    ],
    allowedCollections: [
      "settlement_payment_intents",
      "finance_audit_events",
    ],
    expectedWriteCounts: { offlineFakeMax: 2, production: 0 },
    idempotencyKeyPattern: "actor|payment.prepare|settlement_payments|{id}|{clientKey}",
    auditActions: ["payment.prepare"],
    rollbackOrReversal: "cancel prepared intent; never confirm against Production in prep",
    forbiddenWrites: [
      "settlement_payments.confirm_live",
      "payout_provider_live",
      "order",
    ],
    postWriteVerification: [
      "intent_status=prepared",
      "no_provider_call",
      "production_writes=0",
    ],
    requiredPermissions: ["settlements:execute", "payouts:prepare"],
    fc01Dependent: false,
  },
  adjustment: {
    op: "adjustment",
    phase: "FR6",
    description: "Append-only finance adjustment; never mutates order majors",
    preconditions: [
      "currency_required",
      "country_scope",
      "reason_present",
      "dual_control_on_approve",
    ],
    allowedCollections: ["finance_adjustments", "finance_audit_events"],
    expectedWriteCounts: { offlineFakeMax: 2, production: 0 },
    idempotencyKeyPattern: "actor|adjustment.create|finance_adjustments|{ref}|{clientKey}",
    auditActions: ["adjustment.create", "adjustment.approve"],
    rollbackOrReversal: "reject draft or compensating adjustment — never rewrite majors",
    forbiddenWrites: ["order", "historical_snapshot_mutate"],
    postWriteVerification: [
      "mutatesOrderMajors=false",
      "dual_control_on_approve",
      "production_writes=0",
    ],
    requiredPermissions: ["finance:adjust", "finance:adjust_approve"],
    fc01Dependent: false,
  },
  reversal: {
    op: "reversal",
    phase: "FR6",
    description: "Payment / settlement reversal — auditable; restores outstanding",
    preconditions: [
      "payment_or_settlement_exists",
      "settlements:reverse",
      "reason_present",
    ],
    allowedCollections: [
      "settlement_payments",
      "financial_settlements",
      "finance_audit_events",
    ],
    expectedWriteCounts: { offlineFakeMax: 3, production: 0 },
    idempotencyKeyPattern: "actor|payment.reverse|settlement_payments|{id}|{clientKey}",
    auditActions: ["payment.reverse", "settlement.void"],
    rollbackOrReversal: "reversal is the correction path; no silent undo without audit",
    forbiddenWrites: ["order", "delete_payment_row"],
    postWriteVerification: [
      "payment_status=reversed_or_settlement_voided",
      "audit_reason_present",
      "production_writes=0",
    ],
    requiredPermissions: ["settlements:reverse"],
    fc01Dependent: false,
  },
  refund_accounting: {
    op: "refund_accounting",
    phase: "FR6",
    description:
      "Refund accounting record — order majors immutable; session-linked append-only",
    preconditions: [
      "currency_required",
      "related_order_or_session",
      "amount_authoritative_or_fail_closed",
    ],
    allowedCollections: ["finance_refund_accounting", "finance_audit_events"],
    expectedWriteCounts: { offlineFakeMax: 2, production: 0 },
    idempotencyKeyPattern: "actor|refund.account|finance_refund_accounting|{ref}|{clientKey}",
    auditActions: ["refund.account"],
    rollbackOrReversal: "compensating adjustment/reversal; never mutate order majors",
    forbiddenWrites: ["order", "rewrite_refund_as_zero"],
    postWriteVerification: [
      "mutatesOrderMajors=false",
      "missing_amount_not_zero",
      "production_writes=0",
    ],
    requiredPermissions: ["finance:adjust"],
    fc01Dependent: false,
  },
  chargeback_accounting: {
    op: "chargeback_accounting",
    phase: "FR6",
    description: "FC-04 chargeback append-only accounting; disputed→suspense",
    preconditions: [
      "FC-04_APPROVED",
      "currency_required",
      "never_rewrite_trip",
      "fees_separate",
    ],
    allowedCollections: [
      "finance_chargeback_accounting",
      "finance_adjustments",
      "finance_audit_events",
    ],
    expectedWriteCounts: { offlineFakeMax: 3, production: 0 },
    idempotencyKeyPattern: "actor|chargeback.account|finance_chargeback_accounting|{ref}|{clientKey}",
    auditActions: ["chargeback.account"],
    rollbackOrReversal: "chargeback reverse status + audit; trip majors untouched",
    forbiddenWrites: ["order", "delete_chargeback", "merge_fee_into_principal"],
    postWriteVerification: [
      "mutatesOrderMajors=false",
      "liability_or_suspense_set",
      "fee_separate",
      "production_writes=0",
    ],
    requiredPermissions: ["finance:adjust"],
    fc01Dependent: false,
  },
  payout_preparation: {
    op: "payout_preparation",
    phase: "FR5",
    description: "Payout preparation / state transitions — not live provider payout",
    preconditions: [
      "settlement_locked_or_partial",
      "payouts:prepare",
      "live_payout_forbidden",
    ],
    allowedCollections: ["finance_payout_preparations", "finance_audit_events"],
    expectedWriteCounts: { offlineFakeMax: 2, production: 0 },
    idempotencyKeyPattern: "actor|payout.prepare|finance_payout_preparations|{ref}|{clientKey}",
    auditActions: ["payout.prepare", "payout.state_transition"],
    rollbackOrReversal: "cancel prepared payout; never call live provider in prep",
    forbiddenWrites: ["payout_provider_live", "order", "settlement_payments.confirm_live"],
    postWriteVerification: [
      "state_in_prepared_or_cancelled",
      "no_provider_transfer",
      "production_writes=0",
    ],
    requiredPermissions: ["payouts:prepare"],
    fc01Dependent: false,
  },
};

export const FINANCE_ROLLOUT_PHASE_OPS: Record<
  FinanceRolloutPhase,
  readonly FinanceControlledRolloutOp[]
> = {
  FR1: ["materialize_accounting_snapshot"],
  FR2: ["settlement_v2_create_update"],
  FR3: ["reconciliation"],
  FR4: ["settlement_approval"],
  FR5: ["settlement_execution_preparation", "payout_preparation"],
  FR6: [
    "adjustment",
    "reversal",
    "refund_accounting",
    "chargeback_accounting",
  ],
  FR7: [], // reporting/read model — no writes; documented separately
};

export type Fr7ReportingSpec = {
  phase: "FR7";
  description: string;
  allowedCollections: readonly string[];
  expectedWriteCounts: { offlineFakeMax: 0; production: 0 };
  forbiddenWrites: readonly string[];
  postWriteVerification: readonly string[];
  requiredPermissions: readonly string[];
};

export const FR7_REPORTING_READ_SPEC: Fr7ReportingSpec = {
  phase: "FR7",
  description:
    "Reporting / read model — FinanceReportingReadService computed from snapshots + settlements + payments + append-only adj/refund/chargeback + payout lifecycle; no Finance writes; no third book",
  allowedCollections: [
    "finance_accounting_snapshots (read)",
    "financial_settlements (read)",
    "financial_settlement_payments (read)",
    "finance_adjustments (read)",
    "finance_refund_accounting (read)",
    "finance_chargeback_accounting (read)",
    "finance_payout_preparations (read)",
  ],
  expectedWriteCounts: { offlineFakeMax: 0, production: 0 },
  forbiddenWrites: [
    "any_finance_mutation",
    "ui_firestore_direct",
    "finance_reporting_aggregates",
    "third_accounting_book",
  ],
  postWriteVerification: [
    "read_model_uses_canonical_sources_only",
    "historical_persisted_wins",
    "missing_ne_zero",
    "neutral_memo_non_monetary",
    "no_third_book",
    "production_writes=0",
  ],
  requiredPermissions: ["finance:read", "reports:export"],
};
