/**
 * Policy blockers isolated for Finance offline prep.
 * FC-01 APPROVED at 15% versioned config; missing config still fail-closed.
 * FC-02..FC-05 APPROVED (F6).
 */

import { FINANCE_POLICY_UNRESOLVED_FC01 } from "@/domain/finance/v2/policies/FinancePolicyCodes";

export const FINANCE_POLICY_BLOCKERS = {
  FC_01_PLATFORM_COMMISSION_RATE:
    "FP-01/FC-01: platform commission rate APPROVED at 15% via PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT versioned config. Missing/unapproved binding still fail closed: FINANCE_POLICY_UNRESOLVED_FC01. Historical amounts = persisted total_app (no re-rate).",
  FC_01_FAIL_CLOSED: FINANCE_POLICY_UNRESOLVED_FC01,
  /** Historical Phase 3.6 message retained for evidence; F6 locks APPROVED rules in DiscountTreatmentPolicyF6. */
  FC_02_DISCOUNT_TREATMENT_LEGACY_UNRESOLVED:
    "D-FC-02 (superseded by F6 APPROVED): DiscountTreatmentPolicy unresolved — derived driver net not settlement-eligible",
  FC_02_DISCOUNT_FUNDING_OWNER_REQUIRED:
    "FC-02 APPROVED: discount funding owner required — unknown owner remains POLICY_BLOCKED",
  /** Superseded by F6 FC-03 APPROVED — retained for test/doc references. */
  FP_08_AGENT_SETTLEMENT_PRODUCTION:
    "FP-08: superseded by F6 FC-03 APPROVED (AgentSettlementPolicyF6) — Production write GO still separate",
  /** Superseded by F6 FC-04 APPROVED. */
  FP_11_CHARGEBACK:
    "FP-11: superseded by F6 FC-04 APPROVED — chargeback = append-only adjustment; disputed→suspense",
  /** Superseded by F6 FC-05 APPROVED + current-ops agent-borne 1.00 electronic all markets. */
  GATEWAY_FEE:
    "Gateway fee: FC-05 APPROVED — independent component; default owner Agent; never silent deduct driver/agent earnings; current-ops NEW materialization = 100 minor (1.00) of trip currency per electronic/card payment in all countries, cash = 0; historical persisted amounts remain authoritative",
} as const;

export type FinancePolicyBlockerKey = keyof typeof FINANCE_POLICY_BLOCKERS;
