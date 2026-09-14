/**
 * FC-05 GATEWAY FEE = APPROVED (F6).
 * - Gateway/provider fees are independent financial components.
 * - Default accounting owner = Company unless country/provider contract says otherwise.
 * - Never silently deduct from Driver or Agent earnings.
 * - Configurable by country/provider.
 * - Historical persisted values remain authoritative.
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import type { MoneyAvailability } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePolicyLockStatus } from "@/domain/finance/v2/policies/FinancePolicyCodes";

export type GatewayFeeOwner = "company" | "driver" | "agent" | "shared_contract";

export type GatewayFeePolicyF6 = FinancialPolicy & {
  kind: "gateway_fee";
  independentComponent: true;
  defaultOwner: "company";
  neverSilentDeductFromDriverOrAgent: true;
  historicalPersistedAuthoritative: true;
};

export const FC05_LOCK_STATUS: FinancePolicyLockStatus = "APPROVED";

export const GATEWAY_FEE_POLICY_APPROVED_F6: GatewayFeePolicyF6 = {
  policyId: "GATEWAY_FEE_POLICY_FC05",
  version: "1.0.0-f6-approved",
  status: "approved",
  effectiveFrom: "2026-09-13T00:00:00.000Z",
  effectiveTo: null,
  countryId: null,
  currencyCode: null,
  createdAtUtc: "2026-09-13T00:00:00.000Z",
  approvedAtUtc: "2026-09-13T00:00:00.000Z",
  approvedBy: "f6_human_policy_closure",
  productionApproved: false,
  notes:
    "FC-05 APPROVED: gateway fees independent; default owner Company; never silent deduct from driver/agent; country/provider configurable.",
  kind: "gateway_fee",
  independentComponent: true,
  defaultOwner: "company",
  neverSilentDeductFromDriverOrAgent: true,
  historicalPersistedAuthoritative: true,
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
  deductedFromDriverEarnings: false;
  deductedFromAgentEarnings: false;
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
  return "company";
}

/**
 * Build independent gateway fee component.
 * Missing amount → null / not_represented (never invent 0).
 * Never marks deduction from driver/agent earnings.
 */
export function buildGatewayFeeComponent(input: {
  currency: string;
  amountMinor?: bigint | null;
  countryId?: string | null;
  providerId?: string | null;
  contracts?: readonly GatewayFeeContractOverride[];
  historicalPersistedMinor?: bigint | null;
}): GatewayFeeComponent {
  const currency = input.currency.toUpperCase();
  if (!currency) throw new Error("currency_required");

  let amountMinor: bigint | null = null;
  let availability: MoneyAvailability = "not_represented";

  if (
    input.historicalPersistedMinor !== null &&
    input.historicalPersistedMinor !== undefined
  ) {
    amountMinor = input.historicalPersistedMinor;
    availability = "available";
  } else if (input.amountMinor !== null && input.amountMinor !== undefined) {
    amountMinor = input.amountMinor;
    availability = "available";
  }

  const owner = resolveGatewayFeeOwner({
    countryId: input.countryId ?? null,
    providerId: input.providerId ?? null,
    contracts: input.contracts,
  });

  if (owner === "driver" || owner === "agent") {
    // Explicit contract may assign owner, but silent earnings deduction remains forbidden.
    // Accounting posts as separate payable/receivable — not netted into earnings lines here.
  }

  return {
    amountMinor,
    currency,
    availability,
    owner,
    providerId: input.providerId ?? null,
    countryId: input.countryId ?? null,
    deductedFromDriverEarnings: false,
    deductedFromAgentEarnings: false,
  };
}
