/**
 * Phase 3.6 — FinancialPolicy versioning.
 * Future Production may only use status=approved policies.
 * New / future VAT / commission / chargeback policies stay draft + productionApproved=false
 * until Owner/Accountant approval.
 */

export type FinancialPolicyStatus = "draft" | "approved" | "retired";

export type FinancialPolicy = {
  policyId: string;
  version: string;
  status: FinancialPolicyStatus;
  effectiveFrom: string; // ISO date / datetime UTC
  effectiveTo: string | null;
  countryId: string | null;
  currencyCode: string | null;
  createdAtUtc: string;
  approvedAtUtc: string | null;
  approvedBy: string | null;
  /** Hard gate: Production adapters must require true AND status=approved. */
  productionApproved: boolean;
  notes: string;
};

export type PlatformCommissionPolicyDraft = FinancialPolicy & {
  kind: "platform_commission";
  /** Rate in basis points when approved; null while unresolved. */
  platformCommissionBps: number | null;
  productionApproved: false;
  status: "draft";
};

export type AgentCommissionPolicyDraft = FinancialPolicy & {
  kind: "agent_commission";
  agentCommissionBps: number | null;
  productionApproved: false;
  status: "draft";
};

/**
 * Future trip design fields for agent attribution snapshots
 * (not yet written by Production adapters — Phase 3.6 design only).
 */
export type FutureAgentTripSnapshotFields = {
  agentIdSnapshot: string | null;
  agentCommissionRateSnapshot: number | null;
  agentCommissionAmountSnapshot: number | null;
  agentPolicyVersion: string | null;
};

export function assertPolicyUsableForProduction(policy: FinancialPolicy): void {
  if (policy.status !== "approved" || !policy.productionApproved) {
    throw new Error(
      `FinancialPolicy ${policy.policyId}@${policy.version} is not production-usable (status=${policy.status}, productionApproved=${policy.productionApproved})`,
    );
  }
}

export function createDraftFinancialPolicy(input: {
  policyId: string;
  version: string;
  countryId?: string | null;
  currencyCode?: string | null;
  notes: string;
  createdAtUtc?: string;
}): FinancialPolicy {
  return {
    policyId: input.policyId,
    version: input.version,
    status: "draft",
    effectiveFrom: input.createdAtUtc ?? "1970-01-01T00:00:00.000Z",
    effectiveTo: null,
    countryId: input.countryId ?? null,
    currencyCode: input.currencyCode ?? null,
    createdAtUtc: input.createdAtUtc ?? new Date().toISOString(),
    approvedAtUtc: null,
    approvedBy: null,
    productionApproved: false,
    notes: input.notes,
  };
}

/** Rates for NEW trips must come from a FinancialPolicyProvider — never hardcoded. */
export type FinancialPolicyProvider = {
  getActivePolicy(countryId: string | null): FinancialPolicy | null;
  getPlatformCommissionBps(countryId: string | null): number | null;
  getVatBps(countryId: string | null): number | null;
  assertNonProduction(): void;
};
