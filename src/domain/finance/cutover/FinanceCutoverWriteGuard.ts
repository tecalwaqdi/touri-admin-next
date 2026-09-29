/**
 * Finance cutover write guard — blocks pre-cutover source events from
 * entering the NEW official finance period (certified KPIs / Settlement V2 /
 * payments / recon / wallet period movements).
 *
 * Source clock = business event time (trip completion / payment finality /
 * settlement period), NOT wall-clock write time.
 */

import {
  isOnOrAfterCutover,
  isPreCutover,
  resolveFinanceCutoverDate,
  type FinanceCutoverConfig,
} from "@/domain/finance/cutover/FinanceCutoverConfig";

export type FinanceCutoverWriteOperation =
  | "snapshot_materialize"
  | "auto_finalize"
  | "settlement_prepare"
  | "settlement_payment"
  | "reconciliation"
  | "wallet_period_movement";

export type FinanceCutoverWriteDecision =
  | {
      allowed: true;
      code: "ON_OR_AFTER_CUTOVER";
      sourceEventUtc: string;
      cutoverUtcInstant: string;
    }
  | {
      allowed: false;
      code:
        | "PRE_CUTOVER_SOURCE_EVENT"
        | "SOURCE_EVENT_TIME_MISSING"
        | "CUTOVER_NOT_APPROVED_BLOCKS_NEW_PERIOD_WRITE";
      reason: string;
      sourceEventUtc: string | null;
      cutoverUtcInstant: string;
      operation: FinanceCutoverWriteOperation;
    };

export class FinanceCutoverWriteBlockedError extends Error {
  readonly code: FinanceCutoverWriteDecision & { allowed: false };
  constructor(decision: FinanceCutoverWriteDecision & { allowed: false }) {
    super(
      `cutover_write_blocked:${decision.code}:${decision.operation}:${decision.reason}`,
    );
    this.name = "FinanceCutoverWriteBlockedError";
    this.code = decision;
  }
}

/**
 * Best-effort business-event timestamp from a Legacy order/trip document.
 * Prefer completion / payment-final fields; never invent.
 */
export function extractOrderFinanceSourceEventUtc(
  data: Record<string, unknown> | null | undefined,
): string | null {
  if (!data) return null;
  const candidates = [
    data.completedAtUtc,
    data.completedAt,
    data.completed_at,
    data.tripCompletedAt,
    data.trip_completed_at,
    data.endTripAt,
    data.end_trip_at,
    data.finishedAt,
    data.paymentCompletedAt,
    data.payment_completed_at,
    data.paidAt,
    data.paid_at,
    data.cashCollectedAt,
    data.updatedAtUtc,
    data.updatedAt,
    data.updated_at,
    data.createdAtUtc,
    data.createdAt,
    data.created_at,
  ];
  for (const raw of candidates) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  // Firestore-ish { seconds, nanoseconds } / {_seconds}
  for (const key of ["completedAt", "updatedAt", "createdAt"] as const) {
    const v = data[key];
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const sec =
        typeof o.seconds === "number"
          ? o.seconds
          : typeof o._seconds === "number"
            ? o._seconds
            : null;
      if (sec != null && Number.isFinite(sec)) {
        return new Date(sec * 1000).toISOString();
      }
    }
  }
  return null;
}

/**
 * Evaluate whether a source business event may enter the NEW finance period.
 * Inclusive: event at exact cutoverUtcInstant is allowed.
 */
export function evaluateNewPeriodFinanceWrite(input: {
  sourceEventUtc: string | null | undefined;
  operation: FinanceCutoverWriteOperation;
  cutover?: FinanceCutoverConfig;
  /** When true (default), require FINANCE_CUTOVER_APPROVED for allow path clarity. */
  requireApproved?: boolean;
  env?: Record<string, string | undefined>;
}): FinanceCutoverWriteDecision {
  const cutover =
    input.cutover ??
    resolveFinanceCutoverDate({
      env: input.env,
    });
  const requireApproved = input.requireApproved !== false;
  const source = input.sourceEventUtc?.trim() || null;

  if (requireApproved && !cutover.approved) {
    return {
      allowed: false,
      code: "CUTOVER_NOT_APPROVED_BLOCKS_NEW_PERIOD_WRITE",
      reason: "FINANCE_CUTOVER_APPROVED_not_set",
      sourceEventUtc: source,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
      operation: input.operation,
    };
  }

  if (!source) {
    return {
      allowed: false,
      code: "SOURCE_EVENT_TIME_MISSING",
      reason: "source_business_event_time_unknown_treated_as_pre_cutover",
      sourceEventUtc: null,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
      operation: input.operation,
    };
  }

  if (isPreCutover(source, cutover.cutoverUtcInstant)) {
    return {
      allowed: false,
      code: "PRE_CUTOVER_SOURCE_EVENT",
      reason: `source_event_before_cutover:${source}<${cutover.cutoverUtcInstant}`,
      sourceEventUtc: source,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
      operation: input.operation,
    };
  }

  if (!isOnOrAfterCutover(source, cutover.cutoverUtcInstant)) {
    return {
      allowed: false,
      code: "PRE_CUTOVER_SOURCE_EVENT",
      reason: "source_event_not_on_or_after_cutover",
      sourceEventUtc: source,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
      operation: input.operation,
    };
  }

  return {
    allowed: true,
    code: "ON_OR_AFTER_CUTOVER",
    sourceEventUtc: source,
    cutoverUtcInstant: cutover.cutoverUtcInstant,
  };
}

export function assertNewPeriodFinanceWriteAllowed(
  input: Parameters<typeof evaluateNewPeriodFinanceWrite>[0],
): FinanceCutoverWriteDecision & { allowed: true } {
  const decision = evaluateNewPeriodFinanceWrite(input);
  if (!decision.allowed) {
    throw new FinanceCutoverWriteBlockedError(decision);
  }
  return decision;
}

/**
 * Settlement / recon period must start on or after cutover (new period only).
 * Period entirely before cutover → blocked. Spanning cutover → blocked
 * (must not mix historical into new-period settlement).
 */
export function evaluateNewPeriodSettlementWindow(input: {
  periodFromUtc: string | null | undefined;
  periodToUtc: string | null | undefined;
  operation: Extract<
    FinanceCutoverWriteOperation,
    "settlement_prepare" | "settlement_payment" | "reconciliation"
  >;
  cutover?: FinanceCutoverConfig;
  env?: Record<string, string | undefined>;
}): FinanceCutoverWriteDecision {
  const cutover =
    input.cutover ?? resolveFinanceCutoverDate({ env: input.env });
  const from = input.periodFromUtc?.trim() || null;
  const to = input.periodToUtc?.trim() || null;

  // Until cutover is approved, do not enforce the new-period window
  // (FINANCE_WRITE_ENABLED / Fake gates still apply). KPI clamp also no-ops.
  if (!cutover.approved) {
    return {
      allowed: true,
      code: "ON_OR_AFTER_CUTOVER",
      sourceEventUtc: from ?? cutover.cutoverUtcInstant,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
    };
  }

  if (!from) {
    return {
      allowed: false,
      code: "SOURCE_EVENT_TIME_MISSING",
      reason: "settlement_periodFromUtc_missing",
      sourceEventUtc: null,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
      operation: input.operation,
    };
  }

  // Any period starting before cutover cannot be a new-period settlement.
  if (isPreCutover(from, cutover.cutoverUtcInstant)) {
    return {
      allowed: false,
      code: "PRE_CUTOVER_SOURCE_EVENT",
      reason: `settlement_period_starts_before_cutover:${from}`,
      sourceEventUtc: from,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
      operation: input.operation,
    };
  }

  // Period entirely ending before cutover cannot be new-period (belt + suspenders).
  if (to && isPreCutover(to, cutover.cutoverUtcInstant)) {
    return {
      allowed: false,
      code: "PRE_CUTOVER_SOURCE_EVENT",
      reason: `settlement_period_ends_before_cutover:${to}`,
      sourceEventUtc: to,
      cutoverUtcInstant: cutover.cutoverUtcInstant,
      operation: input.operation,
    };
  }

  return evaluateNewPeriodFinanceWrite({
    sourceEventUtc: from,
    operation: input.operation,
    cutover,
    env: input.env,
    requireApproved: true,
  });
}

/**
 * Clamp API periodFrom to cutover when cutover is approved and caller omitted
 * from or requested a from earlier than cutover (current-period isolation).
 */
export function clampPeriodFromToApprovedCutover(input: {
  periodFromUtc: string | null | undefined;
  cutover?: FinanceCutoverConfig;
  env?: Record<string, string | undefined>;
}): string | null {
  const cutover =
    input.cutover ?? resolveFinanceCutoverDate({ env: input.env });
  if (!cutover.approved) {
    return input.periodFromUtc?.trim() || null;
  }
  const from = input.periodFromUtc?.trim() || null;
  if (!from) return cutover.cutoverUtcInstant;
  if (isPreCutover(from, cutover.cutoverUtcInstant)) {
    return cutover.cutoverUtcInstant;
  }
  return from;
}
