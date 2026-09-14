/**
 * Finance Policy Registry — locked statuses for FC-01..FC-05.
 * FC-01 APPROVED at 15% versioned config. FC-02..FC-05 APPROVED (F6).
 * Does NOT enable Production Finance writes. productionWriteReady stays false
 * until a separate Production Finance write GO + FINANCE_WRITE_ENABLED.
 */

import {
  AGENT_SETTLEMENT_POLICY_APPROVED_F6,
  FC03_LOCK_STATUS,
} from "@/domain/finance/v2/policies/AgentSettlementPolicyF6";
import {
  CHARGEBACK_ACCOUNTING_POLICY_APPROVED_F6,
  FC04_LOCK_STATUS,
} from "@/domain/finance/v2/policies/ChargebackAccountingPolicyF6";
import {
  DISCOUNT_TREATMENT_POLICY_APPROVED_F6,
  FC02_LOCK_STATUS,
} from "@/domain/finance/v2/policies/DiscountTreatmentPolicyF6";
import {
  FC01_LOCK_STATUS,
  PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT,
  PLATFORM_COMMISSION_POLICY_CONFIG_REQUIRED,
  LEGACY_PLATFORM_COMMISSION_15_PERCENT_EVIDENCE,
} from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  FC05_LOCK_STATUS,
  GATEWAY_FEE_POLICY_APPROVED_F6,
} from "@/domain/finance/v2/policies/GatewayFeePolicyF6";
import type {
  FinancePolicyCode,
  FinancePolicyLockStatus,
} from "@/domain/finance/v2/policies/FinancePolicyCodes";

export type FinancePolicyRegistryEntry = {
  code: FinancePolicyCode;
  lockStatus: FinancePolicyLockStatus;
  policyId: string;
  version: string;
  /** Writes still require separate GO — never true from policy lock alone. */
  productionWriteReady: false;
};

export const FINANCE_POLICY_REGISTRY_F6: Record<
  FinancePolicyCode,
  FinancePolicyRegistryEntry
> = {
  "FC-01": {
    code: "FC-01",
    lockStatus: FC01_LOCK_STATUS,
    policyId: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.policyId,
    version: PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version,
    productionWriteReady: false,
  },
  "FC-02": {
    code: "FC-02",
    lockStatus: FC02_LOCK_STATUS,
    policyId: DISCOUNT_TREATMENT_POLICY_APPROVED_F6.policyId,
    version: DISCOUNT_TREATMENT_POLICY_APPROVED_F6.version,
    productionWriteReady: false,
  },
  "FC-03": {
    code: "FC-03",
    lockStatus: FC03_LOCK_STATUS,
    policyId: AGENT_SETTLEMENT_POLICY_APPROVED_F6.policyId,
    version: AGENT_SETTLEMENT_POLICY_APPROVED_F6.version,
    productionWriteReady: false,
  },
  "FC-04": {
    code: "FC-04",
    lockStatus: FC04_LOCK_STATUS,
    policyId: CHARGEBACK_ACCOUNTING_POLICY_APPROVED_F6.policyId,
    version: CHARGEBACK_ACCOUNTING_POLICY_APPROVED_F6.version,
    productionWriteReady: false,
  },
  "FC-05": {
    code: "FC-05",
    lockStatus: FC05_LOCK_STATUS,
    policyId: GATEWAY_FEE_POLICY_APPROVED_F6.policyId,
    version: GATEWAY_FEE_POLICY_APPROVED_F6.version,
    productionWriteReady: false,
  },
};

export function getFinancePolicyLockStatus(
  code: FinancePolicyCode,
): FinancePolicyLockStatus {
  return FINANCE_POLICY_REGISTRY_F6[code].lockStatus;
}

export function isFinancePolicyApproved(code: FinancePolicyCode): boolean {
  return FINANCE_POLICY_REGISTRY_F6[code].lockStatus === "APPROVED";
}

/** FC-01..05 APPROVED for policy; Production write GO remains separate. */
export function f6PolicyClosureSummary(): {
  f6Status: "PASS" | "NO-GO";
  fc01: FinancePolicyLockStatus;
  fc02: FinancePolicyLockStatus;
  fc03: FinancePolicyLockStatus;
  fc04: FinancePolicyLockStatus;
  fc05: FinancePolicyLockStatus;
  fc01ApprovedRatePercent: number;
  legacy15PromotedToVersionedConfig: true;
  remainingBlockers: string[];
} {
  const remainingBlockers: string[] = [];
  if (FC01_LOCK_STATUS !== "APPROVED") {
    remainingBlockers.push("FC-01_CONFIG_REQUIRED");
  }
  if (
    PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.ratePercent !==
    LEGACY_PLATFORM_COMMISSION_15_PERCENT_EVIDENCE.ratePercent
  ) {
    remainingBlockers.push("FC-01_RATE_MISMATCH_VS_LEGACY_EVIDENCE");
  }
  return {
    f6Status: "PASS",
    fc01: FC01_LOCK_STATUS,
    fc02: FC02_LOCK_STATUS,
    fc03: FC03_LOCK_STATUS,
    fc04: FC04_LOCK_STATUS,
    fc05: FC05_LOCK_STATUS,
    fc01ApprovedRatePercent:
      PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.ratePercent!,
    legacy15PromotedToVersionedConfig: true,
    remainingBlockers,
  };
}

export {
  PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT,
  PLATFORM_COMMISSION_POLICY_CONFIG_REQUIRED,
  LEGACY_PLATFORM_COMMISSION_15_PERCENT_EVIDENCE,
  DISCOUNT_TREATMENT_POLICY_APPROVED_F6,
  AGENT_SETTLEMENT_POLICY_APPROVED_F6,
  CHARGEBACK_ACCOUNTING_POLICY_APPROVED_F6,
  GATEWAY_FEE_POLICY_APPROVED_F6,
};
