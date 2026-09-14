/**
 * Offline Finance V2 contracts — design preparation only.
 * Mirrors docs/FINANCE_IMPLEMENTATION_DESIGN.md.
 * NOT a Production write path. FINANCE_WRITE_ENABLED must stay false.
 */

export const FINANCE_WRITE_ENABLED_DEFAULT = false;

/** Production settlement vocabulary (Legacy V2). Synthetic labels are lab-only. */
export const SETTLEMENT_V2_STATUSES = [
  "draft",
  "locked",
  "partially_paid",
  "settled",
  "voided",
] as const;

export type SettlementV2Status = (typeof SETTLEMENT_V2_STATUSES)[number];

export type SettlementPartyType = "driver" | "agent";

export type SettlementDirection =
  | "DRIVER_PAYS_COMPANY"
  | "COMPANY_PAYS_DRIVER"
  | "AGENT_PAYS_COMPANY"
  | "COMPANY_PAYS_AGENT";

export type MoneyAvailability =
  | "available"
  | "missing"
  | "unknown"
  | "not_represented"
  | "incomplete";

export type AvailableMoney = {
  amountMinor: bigint | null;
  currency: string;
  availability: MoneyAvailability;
  reason?: string;
};

/** Persisted order majors — historical SoT. Never invent zeros. */
export type TripFinancialMajors = {
  orderId: string;
  currency: string;
  grossFare: AvailableMoney; // total_mndob2
  customerTotal: AvailableMoney; // total
  platformCommission: AvailableMoney; // total_app
  vatAmount: AvailableMoney; // total_vat
  driverNet: AvailableMoney; // total_mndob
  paymentChannel: "cash" | "card" | "unknown";
  paymentStatus: string;
  lifecycleCompleted: boolean;
};

export type AgentAttributionStatus =
  | "snapshot"
  | "unknown_historical"
  | "active_country_at_quote"; // new trips only

export type AgentAttribution = {
  status: AgentAttributionStatus;
  agentId: string | null;
  ratePercent: number | null;
  amountMinor: bigint | null;
  rateType: "percent_of_platform_fee" | null;
};

export type ChargebackField = {
  amountMinor: null;
  availability: "not_represented";
};

/** Exact pipeline stages — historical loads majors; new may project from approved policy later. */
export const CALCULATION_PIPELINE_ORDER = [
  "gross_fare",
  "discounts",
  "eligibility",
  "platform_commission",
  "vat",
  "driver_net",
  "agent_share",
  "company_net",
  "settlement_positions",
  "settlement_aggregates",
] as const;

export type CalculationPipelineStage = (typeof CALCULATION_PIPELINE_ORDER)[number];

export type AccountingLineEligibility = {
  eligible: boolean;
  exclusionReason?: string;
};

/**
 * Finance RBAC permissions (F6 / FR).
 * view / prepare / approve / execute settlement / adjustment-reversal / payout / export.
 */
export type FinancePermission =
  | "finance:read"
  | "settlements:create"
  | "settlements:prepare"
  | "settlements:approve"
  | "settlements:execute"
  | "settlements:reverse"
  | "finance:adjust"
  | "finance:adjust_approve"
  | "payouts:prepare"
  | "payouts:execute"
  | "reports:export"
  | "audit:read";

export type ReconciliationDimension =
  | "order_majors"
  | "accounting_lines"
  | "settlement_claims"
  | "settlement_payments"
  | "provider_sessions"
  | "payouts"
  | "refunds"
  | "chargebacks";

export type FinanceAuditEvent = {
  id: string;
  atUtc: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  idempotencyKey?: string;
  reason?: string;
};

/** Idempotency key: actor|op|resourceType|resourceId|clientKey */
export function buildFinanceIdempotencyKey(parts: {
  actorUid: string;
  op: string;
  resourceType: string;
  resourceId: string;
  clientKey: string;
}): string {
  return [
    parts.actorUid,
    parts.op,
    parts.resourceType,
    parts.resourceId,
    parts.clientKey,
  ].join("|");
}

export function moneyOrNull(
  amountMinor: bigint | number | null | undefined,
  currency: string,
  availabilityWhenMissing: MoneyAvailability = "missing",
): AvailableMoney {
  if (amountMinor === null || amountMinor === undefined) {
    return {
      amountMinor: null,
      currency,
      availability: availabilityWhenMissing,
      reason: "missing_persisted_major",
    };
  }
  return {
    amountMinor: typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor),
    currency,
    availability: "available",
  };
}

/**
 * Settlement-eligible driver net: persisted major only (D-FC-02).
 * Derived values are never treated as settlement-eligible here.
 */
export function settlementEligibleDriverNet(
  majors: TripFinancialMajors,
): AvailableMoney {
  if (majors.driverNet.availability !== "available" || majors.driverNet.amountMinor === null) {
    return {
      amountMinor: null,
      currency: majors.currency,
      availability: "incomplete",
      reason: "driver_net_not_persisted",
    };
  }
  return majors.driverNet;
}

/** Historical agent: snapshot or unknown — never invent current country agent. */
export function resolveHistoricalAgentAttribution(input: {
  snapshotAgentId?: string | null;
  snapshotAmountMinor?: bigint | number | null;
  snapshotRatePercent?: number | null;
  currentCountryAgentId?: string | null;
}): AgentAttribution {
  const hasSnapshot =
    input.snapshotAgentId != null &&
    input.snapshotAgentId !== "" &&
    input.snapshotAmountMinor != null;

  if (hasSnapshot) {
    return {
      status: "snapshot",
      agentId: input.snapshotAgentId!,
      ratePercent: input.snapshotRatePercent ?? null,
      amountMinor:
        typeof input.snapshotAmountMinor === "bigint"
          ? input.snapshotAmountMinor
          : BigInt(input.snapshotAmountMinor!),
      rateType: "percent_of_platform_fee",
    };
  }

  // Explicitly ignore currentCountryAgentId for historical attribution.
  void input.currentCountryAgentId;
  return {
    status: "unknown_historical",
    agentId: null,
    ratePercent: null,
    amountMinor: null,
    rateType: null,
  };
}

export function chargebackNotRepresented(): ChargebackField {
  return { amountMinor: null, availability: "not_represented" };
}

/** Production write gate — always false in this preparation scaffold. */
export function assertFinanceWritesDisabled(flag: boolean = FINANCE_WRITE_ENABLED_DEFAULT): void {
  if (flag) {
    throw new Error("FINANCE_WRITE_ENABLED must remain false during design preparation");
  }
}

export function canTransitionSettlementV2(
  from: SettlementV2Status,
  to: SettlementV2Status,
): boolean {
  const edges: Record<SettlementV2Status, SettlementV2Status[]> = {
    draft: ["locked", "voided"],
    locked: ["partially_paid", "settled", "voided"],
    partially_paid: ["settled", "voided"],
    settled: [],
    voided: [],
  };
  return edges[from].includes(to);
}

export function creatorCannotApprove(creatorUserId: string, approverUserId: string): boolean {
  return creatorUserId !== approverUserId;
}
