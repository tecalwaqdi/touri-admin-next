/**
 * FC-05 GATEWAY FEE = APPROVED (F6) + current-ops amount/owner lock.
 * - Gateway/provider fees are independent financial components.
 * - Current-ops default accounting owner = Agent (الوكيل).
 * - Never silently deduct from Driver or Agent earnings lines
 *   (fee posts as a separate payable/receivable component).
 * - Configurable by country/provider contract override.
 * - Historical persisted values remain authoritative (no silent reprice).
 *
 * Current-ops amount rule (forward-only for NEW snapshot materialization):
 * - Electronic / card payment → fixed **1.00 SAR** = 100 halalas
 *   in **SAR currency** for every market/country (not local trip currency).
 * - Cash → 0 (no gateway fee).
 * - Do NOT silently reprice historical persisted snapshots.
 * - Backfill of historical electronic trips = separate explicit job only.
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import type { MoneyAvailability } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePolicyLockStatus } from "@/domain/finance/v2/policies/FinancePolicyCodes";

export type GatewayFeeOwner = "company" | "driver" | "agent" | "shared_contract";

export type GatewayFeePaymentChannel = "cash" | "card" | "unknown";

/** Always SAR for current-ops electronic gateway fee (1.00 Riyal). */
export const CURRENT_OPS_GATEWAY_FEE_CURRENCY = "SAR" as const;

/**
 * 1.00 SAR = 100 halalas.
 * Current-ops electronic gateway fee — all countries; currency always SAR.
 */
export const CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR = 100n;

/** @deprecated Use CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR */
export const CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR_SAR =
  CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR;

export type GatewayFeePolicyF6 = FinancialPolicy & {
  kind: "gateway_fee";
  independentComponent: true;
  /** Current-ops: Agent bears the fee (separate component, not silent earnings net). */
  defaultOwner: "agent";
  neverSilentDeductFromDriverOrAgent: true;
  historicalPersistedAuthoritative: true;
  /** Applies in all markets — fee amount is always 1.00 SAR. */
  appliesAllCountries: true;
  /**
   * Fixed electronic fee in SAR minor units for NEW calcs only.
   * Cash → 0; historical persisted amounts still win when present.
   */
  currentOpsElectronicFeeMinor: typeof CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR;
  currentOpsElectronicFeeCurrency: typeof CURRENT_OPS_GATEWAY_FEE_CURRENCY;
  /** Compat alias — same as currentOpsElectronicFeeMinor. */
  currentOpsElectronicFeeMinorSar: typeof CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR;
};

export const FC05_LOCK_STATUS: FinancePolicyLockStatus = "APPROVED";

export const GATEWAY_FEE_POLICY_APPROVED_F6: GatewayFeePolicyF6 = {
  policyId: "GATEWAY_FEE_POLICY_FC05",
  version: "1.3.0-f6-agent-1-sar-all-markets",
  status: "approved",
  effectiveFrom: "2026-09-13T00:00:00.000Z",
  effectiveTo: null,
  countryId: null,
  currencyCode: "SAR",
  createdAtUtc: "2026-09-13T00:00:00.000Z",
  approvedAtUtc: "2026-09-23T00:00:00.000Z",
  approvedBy: "ops_confirmed_agent_bears_1_sar_electronic_all_markets",
  productionApproved: true,
  notes:
    "FC-05 APPROVED + current-ops: electronic/card = 1.00 SAR (100 halalas) per payment in SAR currency for every country; cash = 0; owner = Agent (الوكيل). Never silent-deduct driver/agent earnings — separate component. Historical persisted gatewayFeeMinor remains authoritative when present.",
  kind: "gateway_fee",
  independentComponent: true,
  defaultOwner: "agent",
  neverSilentDeductFromDriverOrAgent: true,
  historicalPersistedAuthoritative: true,
  appliesAllCountries: true,
  currentOpsElectronicFeeMinor: CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR,
  currentOpsElectronicFeeCurrency: CURRENT_OPS_GATEWAY_FEE_CURRENCY,
  currentOpsElectronicFeeMinorSar: CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR,
};

export type GatewayFeeContractOverride = {
  countryId: string;
  providerId: string;
  owner: GatewayFeeOwner;
};

export type GatewayFeeComponent = {
  amountMinor: bigint | null;
  /** Fee currency — SAR for current-ops electronic; trip currency only when historical/explicit. */
  currency: string;
  availability: MoneyAvailability;
  owner: GatewayFeeOwner;
  providerId: string | null;
  countryId: string | null;
  paymentChannel: GatewayFeePaymentChannel | null;
  deductedFromDriverEarnings: false;
  deductedFromAgentEarnings: false;
  /** How the amount was resolved — never used to rewrite history. */
  amountSource:
    | "historical_persisted"
    | "explicit_input"
    | "current_ops_electronic_1_sar"
    | "current_ops_cash_zero"
    | "not_represented";
};

export function resolveGatewayFeeOwner(input: {
  countryId: string | null;
  providerId: string | null;
  contracts?: readonly GatewayFeeContractOverride[];
}): GatewayFeeOwner {
  if (input.countryId && input.providerId && input.contracts) {
    const hit = input.contracts.find(
      (c) =>
        c.countryId === input.countryId && c.providerId === input.providerId,
    );
    if (hit) return hit.owner;
  }
  return GATEWAY_FEE_POLICY_APPROVED_F6.defaultOwner;
}

/**
 * Resolve current-ops gateway fee for NEW snapshot materialization only.
 * Historical persisted amounts must be passed separately and take precedence.
 *
 * - cash → 0 SAR (any trip; no processor fee)
 * - card / electronic → 100 SAR-halalas (1.00 SAR) for all countries
 * - unknown → null
 */
export function resolveCurrentOpsGatewayFeeMinor(input: {
  paymentChannel: GatewayFeePaymentChannel;
  /** Trip currency — ignored for electronic amount; fee is always SAR. */
  currency?: string;
}): {
  amountMinor: bigint | null;
  currency: string;
  availability: MoneyAvailability;
  amountSource: GatewayFeeComponent["amountSource"];
} {
  if (input.paymentChannel === "cash") {
    return {
      amountMinor: 0n,
      currency: CURRENT_OPS_GATEWAY_FEE_CURRENCY,
      availability: "available",
      amountSource: "current_ops_cash_zero",
    };
  }
  if (input.paymentChannel === "card") {
    return {
      amountMinor: CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR,
      currency: CURRENT_OPS_GATEWAY_FEE_CURRENCY,
      availability: "available",
      amountSource: "current_ops_electronic_1_sar",
    };
  }
  return {
    amountMinor: null,
    currency: CURRENT_OPS_GATEWAY_FEE_CURRENCY,
    availability: "not_represented",
    amountSource: "not_represented",
  };
}

/**
 * Build independent gateway fee component.
 * Precedence (never invent historical zeros from current-ops):
 * 1. historicalPersistedMinor when provided (including explicit 0) — trip currency
 * 2. amountMinor when explicitly provided — trip currency (or input.currency)
 * 3. current-ops from paymentChannel (NEW calcs only) — always SAR
 * 4. not_represented
 *
 * Owner defaults to Agent; never marks silent deduction from driver/agent earnings.
 */
export function buildGatewayFeeComponent(input: {
  currency: string;
  amountMinor?: bigint | null;
  paymentChannel?: GatewayFeePaymentChannel | null;
  countryId?: string | null;
  providerId?: string | null;
  contracts?: readonly GatewayFeeContractOverride[];
  /** When set (including 0n), wins — do not reprice with current-ops. */
  historicalPersistedMinor?: bigint | null;
  /**
   * When true and no historical/explicit amount, apply current-ops from paymentChannel.
   * Default true for NEW materialization; set false when only inspecting missing history.
   */
  applyCurrentOpsWhenMissing?: boolean;
}): GatewayFeeComponent {
  const tripCurrency = input.currency.toUpperCase();
  if (!tripCurrency) throw new Error("currency_required");

  let amountMinor: bigint | null = null;
  let currency = tripCurrency;
  let availability: MoneyAvailability = "not_represented";
  let amountSource: GatewayFeeComponent["amountSource"] = "not_represented";

  if (
    input.historicalPersistedMinor !== null &&
    input.historicalPersistedMinor !== undefined
  ) {
    amountMinor = input.historicalPersistedMinor;
    availability = "available";
    amountSource = "historical_persisted";
  } else if (input.amountMinor !== null && input.amountMinor !== undefined) {
    amountMinor = input.amountMinor;
    availability = "available";
    amountSource = "explicit_input";
  } else if (
    input.applyCurrentOpsWhenMissing !== false &&
    input.paymentChannel
  ) {
    const resolved = resolveCurrentOpsGatewayFeeMinor({
      paymentChannel: input.paymentChannel,
      currency: tripCurrency,
    });
    amountMinor = resolved.amountMinor;
    currency = resolved.currency;
    availability = resolved.availability;
    amountSource = resolved.amountSource;
  }

  const owner = resolveGatewayFeeOwner({
    countryId: input.countryId ?? null,
    providerId: input.providerId ?? null,
    contracts: input.contracts,
  });

  return {
    amountMinor,
    currency,
    availability,
    owner,
    providerId: input.providerId ?? null,
    countryId: input.countryId ?? null,
    paymentChannel: input.paymentChannel ?? null,
    deductedFromDriverEarnings: false,
    deductedFromAgentEarnings: false,
    amountSource,
  };
}
