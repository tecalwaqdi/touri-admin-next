/**
 * Trip financial snapshot from persisted order majors (SoT).
 * Historical path: load majors — never invent rates or zeros.
 * Offline / Fake first. Production write path gated separately.
 */

import {
  moneyOrNull,
  resolveHistoricalAgentAttribution,
  settlementEligibleDriverNet,
  type AgentAttribution,
  type AvailableMoney,
  type TripFinancialMajors,
} from "@/domain/finance/v2/FinanceImplementationContracts";

export type TripFinancialSnapshot = {
  majors: TripFinancialMajors;
  agent: AgentAttribution;
  countryId: string | null;
  driverId: string | null;
  /** Diagnostic only — never settlement-eligible (D-FC-02). */
  derivedDriverNet: AvailableMoney;
  /** Provenance-derived when both app + vat present; else incomplete. */
  driverDeductions: AvailableMoney;
  companyPlatformNet: AvailableMoney;
  chargeback: { amountMinor: null; availability: "not_represented" };
  refundSessionAmount: AvailableMoney;
  warnings: string[];
};

function majorToMinor(
  major: number | bigint | null | undefined,
): bigint | null {
  if (major === null || major === undefined) return null;
  if (typeof major === "bigint") return major;
  if (!Number.isFinite(major)) return null;
  return BigInt(Math.round(major * 100));
}

/**
 * Build snapshot from persisted majors (already in minor units when Fake).
 * Prefer callers that pass minors explicitly for Fake; Production adapter
 * converts Legacy SAR majors → minors before calling this.
 */
export function buildTripFinancialSnapshot(input: {
  orderId: string;
  currency: string;
  grossFareMinor: bigint | number | null | undefined;
  customerTotalMinor: bigint | number | null | undefined;
  platformCommissionMinor: bigint | number | null | undefined;
  vatAmountMinor: bigint | number | null | undefined;
  driverNetMinor: bigint | number | null | undefined;
  paymentChannel: "cash" | "card" | "unknown";
  paymentStatus: string;
  lifecycleCompleted: boolean;
  agentSnapshot?: {
    agentId?: string | null;
    amountMinor?: bigint | number | null;
    ratePercent?: number | null;
  };
  currentCountryAgentId?: string | null;
  refundSessionAmountMinor?: bigint | number | null;
}): TripFinancialSnapshot {
  const currency = input.currency.toUpperCase();
  const warnings: string[] = [];

  const majors: TripFinancialMajors = {
    orderId: input.orderId,
    currency,
    grossFare: moneyOrNull(input.grossFareMinor, currency),
    customerTotal: moneyOrNull(input.customerTotalMinor, currency),
    platformCommission: moneyOrNull(input.platformCommissionMinor, currency),
    vatAmount: moneyOrNull(input.vatAmountMinor, currency),
    driverNet: moneyOrNull(input.driverNetMinor, currency),
    paymentChannel: input.paymentChannel,
    paymentStatus: input.paymentStatus,
    lifecycleCompleted: input.lifecycleCompleted,
  };

  for (const [name, field] of [
    ["grossFare", majors.grossFare],
    ["customerTotal", majors.customerTotal],
    ["platformCommission", majors.platformCommission],
    ["vatAmount", majors.vatAmount],
    ["driverNet", majors.driverNet],
  ] as const) {
    if (field.availability !== "available") {
      warnings.push(`${name}_${field.availability}`);
    }
  }

  const agent = resolveHistoricalAgentAttribution({
    snapshotAgentId: input.agentSnapshot?.agentId,
    snapshotAmountMinor: input.agentSnapshot?.amountMinor,
    snapshotRatePercent: input.agentSnapshot?.ratePercent,
    currentCountryAgentId: input.currentCountryAgentId,
  });
  if (agent.status === "unknown_historical") {
    warnings.push("agent_attribution_unknown_historical");
  }

  let derivedDriverNet: AvailableMoney;
  if (
    majors.grossFare.availability === "available" &&
    majors.platformCommission.availability === "available" &&
    majors.vatAmount.availability === "available" &&
    majors.grossFare.amountMinor != null &&
    majors.platformCommission.amountMinor != null &&
    majors.vatAmount.amountMinor != null
  ) {
    derivedDriverNet = {
      amountMinor:
        majors.grossFare.amountMinor -
        majors.platformCommission.amountMinor -
        majors.vatAmount.amountMinor,
      currency,
      availability: "available",
      reason: "derived_diagnostic_not_settlement_eligible",
    };
  } else {
    derivedDriverNet = {
      amountMinor: null,
      currency,
      availability: "incomplete",
      reason: "cannot_derive_driver_net",
    };
  }

  let driverDeductions: AvailableMoney;
  if (
    majors.platformCommission.availability === "available" &&
    majors.vatAmount.availability === "available" &&
    majors.platformCommission.amountMinor != null &&
    majors.vatAmount.amountMinor != null
  ) {
    driverDeductions = {
      amountMinor:
        majors.platformCommission.amountMinor + majors.vatAmount.amountMinor,
      currency,
      availability: "available",
      reason: "derived_app_plus_vat",
    };
  } else {
    driverDeductions = {
      amountMinor: null,
      currency,
      availability: "incomplete",
      reason: "deductions_require_app_and_vat",
    };
  }

  let companyPlatformNet: AvailableMoney;
  if (
    majors.platformCommission.availability === "available" &&
    majors.platformCommission.amountMinor != null
  ) {
    if (agent.status === "snapshot" && agent.amountMinor != null) {
      companyPlatformNet = {
        amountMinor: majors.platformCommission.amountMinor - agent.amountMinor,
        currency,
        availability: "available",
      };
    } else if (agent.status === "unknown_historical") {
      companyPlatformNet = {
        amountMinor: null,
        currency,
        availability: "incomplete",
        reason: "agent_slice_unknown_historical",
      };
    } else {
      companyPlatformNet = {
        amountMinor: majors.platformCommission.amountMinor,
        currency,
        availability: "available",
      };
    }
  } else {
    companyPlatformNet = {
      amountMinor: null,
      currency,
      availability: majors.platformCommission.availability,
      reason: "platform_commission_unavailable",
    };
  }

  return {
    majors,
    agent,
    countryId: null,
    driverId: null,
    derivedDriverNet,
    driverDeductions,
    companyPlatformNet,
    chargeback: { amountMinor: null, availability: "not_represented" },
    refundSessionAmount: moneyOrNull(
      input.refundSessionAmountMinor,
      currency,
      input.refundSessionAmountMinor === undefined ? "not_represented" : "missing",
    ),
    warnings,
  };
}

/** Prefer persisted driver net over derived (D-FC-02 / REQ-3). */
export function preferPersistedDriverNet(
  snapshot: TripFinancialSnapshot,
): AvailableMoney {
  const persisted = settlementEligibleDriverNet(snapshot.majors);
  if (persisted.availability === "available") return persisted;
  return {
    ...snapshot.derivedDriverNet,
    reason: "derived_diagnostic_only_persisted_missing",
  };
}

export { majorToMinor };
