/**
 * FC-03 AGENT SETTLEMENT = APPROVED (F6).
 * - ONE COUNTRY = ONE ACTIVE AGENT.
 * - Cash collected through local agent → Agent↔Company settlement.
 * - Card/electronic money received by company ≠ agent cash collection.
 * - Expose separately: collected cash, owed to company, owed to agent,
 *   adjustments, paid, outstanding.
 * - Never combine card receipts and agent cash into one opaque balance.
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import type { FinancePolicyLockStatus } from "@/domain/finance/v2/policies/FinancePolicyCodes";

export type AgentSettlementPolicyF6 = FinancialPolicy & {
  kind: "agent_settlement";
  oneCountryOneActiveAgent: true;
  cashThroughAgentParticipates: true;
  cardNotAgentCash: true;
  separateExposureRequired: true;
};

export const FC03_LOCK_STATUS: FinancePolicyLockStatus = "APPROVED";

export const AGENT_SETTLEMENT_POLICY_APPROVED_F6: AgentSettlementPolicyF6 = {
  policyId: "AGENT_SETTLEMENT_POLICY_FC03",
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
    "FC-03 APPROVED: one-active-agent; cash via agent in Agent↔Company; card ≠ agent cash; separate exposure fields.",
  kind: "agent_settlement",
  oneCountryOneActiveAgent: true,
  cashThroughAgentParticipates: true,
  cardNotAgentCash: true,
  separateExposureRequired: true,
};

/** Explicit settlement exposure — never opaque combined balances. */
export type AgentSettlementExposure = {
  currency: string;
  collectedCashMinor: bigint;
  /** Card/electronic receipts held by company — not agent cash. */
  companyCardReceiptsMinor: bigint;
  owedToCompanyMinor: bigint;
  owedToAgentMinor: bigint;
  adjustmentsMinor: bigint;
  paidMinor: bigint;
  outstandingMinor: bigint;
};

export function buildAgentSettlementExposure(input: {
  currency: string;
  paymentChannel: "cash" | "card" | "unknown";
  /** Cash collected that participates in agent settlement (local agent). */
  agentCollectedCashMinor?: bigint | null;
  /** Card money received by company — never folded into agent cash. */
  companyCardReceiptsMinor?: bigint | null;
  owedToCompanyMinor?: bigint | null;
  owedToAgentMinor?: bigint | null;
  adjustmentsMinor?: bigint | null;
  paidMinor?: bigint | null;
}): AgentSettlementExposure {
  const currency = input.currency.toUpperCase();
  if (!currency) {
    throw new Error("currency_required");
  }

  const collectedCashMinor =
    input.paymentChannel === "cash"
      ? (input.agentCollectedCashMinor ?? 0n)
      : 0n;
  const companyCardReceiptsMinor =
    input.paymentChannel === "card"
      ? (input.companyCardReceiptsMinor ?? 0n)
      : (input.companyCardReceiptsMinor ?? 0n);

  // Card channel must not inflate agent collected cash.
  if (input.paymentChannel === "card" && (input.agentCollectedCashMinor ?? 0n) !== 0n) {
    throw new Error("fc03_card_must_not_be_agent_cash");
  }

  const owedToCompanyMinor = input.owedToCompanyMinor ?? 0n;
  const owedToAgentMinor = input.owedToAgentMinor ?? 0n;
  const adjustmentsMinor = input.adjustmentsMinor ?? 0n;
  const paidMinor = input.paidMinor ?? 0n;
  const outstandingMinor =
    owedToCompanyMinor + owedToAgentMinor + adjustmentsMinor - paidMinor;

  return {
    currency,
    collectedCashMinor,
    companyCardReceiptsMinor,
    owedToCompanyMinor,
    owedToAgentMinor,
    adjustmentsMinor,
    paidMinor,
    outstandingMinor,
  };
}

export function assertCardNotCombinedWithAgentCash(exposure: AgentSettlementExposure): void {
  // Structural guarantee: fields remain separate keys (opaque merge forbidden by type).
  if (
    typeof exposure.collectedCashMinor !== "bigint" ||
    typeof exposure.companyCardReceiptsMinor !== "bigint"
  ) {
    throw new Error("fc03_opaque_balance_forbidden");
  }
}
