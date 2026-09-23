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
 * - Electronic / card payment → fixed 1.00 major unit = 100 minor
 *   of the trip currency (1 SAR when currency is SAR; same 100-minor
 *   pattern for all markets — all countries).
 * - Cash → 0 (no gateway fee).
 * - Do NOT silently reprice historical persisted snapshots.
 * - Backfill of historical electronic trips = separate explicit job only.
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import type { MoneyAvailability } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePolicyLockStatus } from "@/domain/finance/v2/policies/FinancePolicyCodes";

export type GatewayFeeOwner = "company" | "driver" | "agent" | "shared_contract";

export type GatewayFeePaymentChannel = "cash" | "card" | "unknown";

/**
 * 1.00 major unit = 100 minor (halalas when SAR).
 * Current-ops electronic gateway fee — all countries / trip currencies.
 */
export const CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR = 100n;

/** @deprecated Use CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR — alias retained for SAR wording. */
export const CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR_SAR =
  CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR;

export type GatewayFeePolicyF6 = FinancialPolicy & {
  kind: "gateway_fee";
  independentComponent: true;
  /** Current-ops: Agent bears the fee (separate component, not silent earnings net). */
  defaultOwner: "agent";
  neverSilentDeductFromDriverOrAgent: true;
  historicalPersistedAuthoritative: true;
  /** Applies in all markets — fee amount is 100 minor of trip currency. */
  appliesAllCountries: true;
  /**
   * Fixed electronic fee in minor units for NEW calcs only.
   * Cash → 0; historical persisted amounts still win when present.
   */
  currentOpsElectronicFeeMinor: typeof CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR;
  /** Compat alias — same as currentOpsElectronicFeeMinor. */
  currentOpsElectronicFeeMinorSar: typeof CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR;
};

export const FC05_LOCK_STATUS: FinancePolicyLockStatus = "APPROVED";

export const GATEWAY_FEE_POLICY_APPROVED_F6: GatewayFeePolicyF6 = {
  policyId: "GATEWAY_FEE_POLICY_FC05",
  version: "1.2.0-f6-agent-1unit-all-markets",
  status: "approved",
  effectiveFrom: "2026-09-13T00:00:00.000Z",
  effectiveTo: null,
  countryId: null,
  currencyCode: null,
  createdAtUtc: "2026-09-13T00:00:00.000Z",
  approvedAtUtc: "2026-09-23T00:00:00.000Z",
  approvedBy: "ops_confirmed_agent_bears_1_unit_electronic_all_markets",
  productionApproved: false,
  notes:
    "FC-05 APPROVED + current-ops: electronic/card = 100 minor (1.00) of trip currency per payment; cash = 0; owner = Agent (الوكيل); all countries. Never silent-deduct driver/agent earnings — separate component. Historical persisted gatewayFeeMinor remains authoritative. productionApproved=false — Production Finance writes still require FINANCE_WRITE_ENABLED + separate GO.",
  kind: "gateway_fee",
  independentComponent: true,
  defaultOwner: "agent",
  neverSilentDeductFromDriverOrAgent: true,
  historicalPersistedAuthoritative: true,
  appliesAllCountries: true,
  currentOpsElectronicFeeMinor: CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR,
  currentOpsElectronicFeeMinorSar: CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR,
};

export type GatewayFeeContractOverride = {
  countryId: string;
  providerId: string;
  owner: GatewayFeeOwner;
};

export type GatewayFeeComponent = {
  amountMinor: bigint | null;
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
    | "current_ops_electronic_1unit"
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
 * - cash → 0 (any currency; no processor fee)
 * - card / electronic → 100 minor of trip currency (all countries)
 * - unknown → null
 */
export function resolveCurrentOpsGatewayFeeMinor(input: {
  paymentChannel: GatewayFeePaymentChannel;
  currency: string;
}): {
  amountMinor: bigint | null;
  availability: MoneyAvailability;
  amountSource: GatewayFeeComponent["amountSource"];
} {
  const currency = input.currency.toUpperCase();
  if (!currency) {
    return {
      amountMinor: null,
      availability: "not_represented",
      amountSource: "not_represented",
    };
  }
  if (input.paymentChannel === "cash") {
    return {
      amountMinor: 0n,
      availability: "available",
      amountSource: "current_ops_cash_zero",
    };
  }
  if (input.paymentChannel === "card") {
    return {
      amountMinor: CURRENT_OPS_ELECTRONIC_GATEWAY_FEE_MINOR,
      availability: "available",
      amountSource: "current_ops_electronic_1unit",
    };
  }
  return {
    amountMinor: null,
    availability: "not_represented",
    amountSource: "not_represented",
  };
}

/**
 * Build independent gateway fee component.
 * Precedence (never invent historical zeros from current-ops):
 * 1. historicalPersistedMinor when provided (including explicit 0)
 * 2. amountMinor when explicitly provided
 * 3. current-ops from paymentChannel (NEW calcs only)
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
  const currency = input.currency.toUpperCase();
  if (!currency) throw new Error("currency_required");

  let amountMinor: bigint | null = null;
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
      currency,
    });
    amountMinor = resolved.amountMinor;
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
