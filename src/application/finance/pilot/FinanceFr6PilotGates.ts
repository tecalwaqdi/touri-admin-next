/**
 * FR6 adjustment pilot operator gates — prep checklist + live arm.
 * SoD: finance:adjust preparer ≠ finance:adjust_approve approver.
 * settlements:execute must NOT imply adjust.
 */

import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { isFinancePolicyApproved } from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import {
  FINANCE_FR6_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR6_ADJUSTMENT_PILOT_APPLY_ENV,
  FINANCE_FR6_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR6_EXPECTED_PROJECT_ID,
  FINANCE_FR6_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR6_REQUIRED_RBAC_APPROVE,
  FINANCE_FR6_REQUIRED_RBAC_CREATE,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";
import { isFinanceFr6AdjustmentPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr6AdjustmentPilotApplyEnabled";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceFr6PrepChecklistItem = {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
};

export type FinanceFr6OperatorGateEnv = {
  readonly FINANCE_FR6_ADJUSTMENT_PILOT_APPLY?: string | undefined;
  readonly SOURCE?: string | undefined;
  readonly FINANCE_WRITE_ENABLED?: string | undefined;
  readonly EXPECTED_PROJECT_ID?: string | undefined;
  readonly GOOGLE_CLOUD_PROJECT?: string | undefined;
  readonly GLOBAL_PRODUCTION_WRITE_ENABLED?: string | undefined;
  readonly PRODUCTION_WRITE_ENABLED?: string | undefined;
  readonly DRIVER_WRITE_ENABLED?: string | undefined;
  readonly AGENT_WRITE_ENABLED?: string | undefined;
  readonly CUSTOMER_WRITE_ENABLED?: string | undefined;
  readonly FINANCE_FR1_PILOT_APPLY?: string | undefined;
  readonly FINANCE_FR2_SETTLEMENT_PILOT_APPLY?: string | undefined;
  readonly FINANCE_FR3_RECON_PILOT_VERIFY?: string | undefined;
  readonly FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY?: string | undefined;
  readonly FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY?: string | undefined;
  readonly [key: string]: string | undefined;
};

export function assertFinanceFr6PrepWriteDisabled(
  env: FinanceFr6OperatorGateEnv = process.env,
): void {
  if (env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error(
      "FINANCE_WRITE_ENABLED must remain false during FR6 adjustment pilot preparation",
    );
  }
  if (FINANCE_WRITE_ENABLED_DEFAULT !== false) {
    throw new Error("FINANCE_WRITE_ENABLED_DEFAULT must be false");
  }
}

export function actorHasFinanceFr6CreateRbac(
  permissions: readonly FinancePermission[],
): boolean {
  return (
    permissions.includes("finance:read") &&
    permissions.includes(FINANCE_FR6_REQUIRED_RBAC_CREATE)
  );
}

export function actorHasFinanceFr6ApproveRbac(
  permissions: readonly FinancePermission[],
): boolean {
  return (
    permissions.includes("finance:read") &&
    permissions.includes(FINANCE_FR6_REQUIRED_RBAC_APPROVE)
  );
}

export function executeDoesNotImplyAdjust(
  permissions: readonly FinancePermission[],
): boolean {
  if (!permissions.includes("settlements:execute")) return true;
  return !permissions.includes("finance:adjust");
}

export function evaluateFinanceFr6LiveArmGates(input: {
  env: FinanceFr6OperatorGateEnv;
  mode: "preparation" | "live_apply";
}): {
  armed: boolean;
  allowed: boolean;
  blockers: string[];
  projectId: typeof FINANCE_FR6_EXPECTED_PROJECT_ID | null;
  expectedAdcPrincipal: typeof FINANCE_FR6_EXPECTED_ADC_PRINCIPAL;
  allowedCollections: typeof FINANCE_FR6_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR6_FORBIDDEN_WRITE_COLLECTIONS;
} {
  const blockers: string[] = [];
  const armed = isFinanceFr6AdjustmentPilotApplyEnabled(
    input.env[FINANCE_FR6_ADJUSTMENT_PILOT_APPLY_ENV],
  );

  if (input.mode === "preparation") {
    if (input.env.FINANCE_WRITE_ENABLED === "true") {
      blockers.push("FINANCE_WRITE_ENABLED_must_be_false_during_prep");
    }
    return {
      armed,
      allowed: false,
      blockers: [
        ...blockers,
        "preparation_mode_no_live_write",
        ...(armed ? ["harness_armed_but_prep_refuses_write"] : []),
      ],
      projectId: FINANCE_FR6_EXPECTED_PROJECT_ID,
      expectedAdcPrincipal: FINANCE_FR6_EXPECTED_ADC_PRINCIPAL,
      allowedCollections: FINANCE_FR6_ALLOWED_WRITE_COLLECTIONS,
      forbiddenCollections: FINANCE_FR6_FORBIDDEN_WRITE_COLLECTIONS,
    };
  }

  if (!armed) blockers.push("FINANCE_FR6_ADJUSTMENT_PILOT_APPLY!=1");
  if (input.env.FINANCE_WRITE_ENABLED !== "true") {
    blockers.push("FINANCE_WRITE_ENABLED!=true");
  }
  if (input.env.GLOBAL_PRODUCTION_WRITE_ENABLED === "true") {
    blockers.push("GLOBAL_PRODUCTION_WRITE_ENABLED_must_be_false");
  }
  if (input.env.PRODUCTION_WRITE_ENABLED === "true") {
    blockers.push("PRODUCTION_WRITE_ENABLED_must_be_false");
  }
  const projectId = (input.env.EXPECTED_PROJECT_ID ?? "").trim();
  const gcp = (input.env.GOOGLE_CLOUD_PROJECT ?? "").trim();
  if (
    projectId !== FINANCE_FR6_EXPECTED_PROJECT_ID ||
    gcp !== FINANCE_FR6_EXPECTED_PROJECT_ID
  ) {
    blockers.push(
      `project_mismatch:expected=${FINANCE_FR6_EXPECTED_PROJECT_ID}`,
    );
  }
  if (input.env.DRIVER_WRITE_ENABLED === "true") {
    blockers.push("DRIVER_WRITE_ENABLED_must_be_false");
  }
  if (input.env.AGENT_WRITE_ENABLED === "true") {
    blockers.push("AGENT_WRITE_ENABLED_must_be_false");
  }
  if (input.env.CUSTOMER_WRITE_ENABLED === "true") {
    blockers.push("CUSTOMER_WRITE_ENABLED_must_be_false");
  }

  const source = (input.env.SOURCE ?? "").trim().toLowerCase();
  if (
    source !== "fr5_settlement_settled" &&
    source !== "fr5_settled" &&
    source !== "settlement_v2_settled"
  ) {
    blockers.push("SOURCE_must_be_fr5_settlement_settled");
  }

  for (const [key, label] of [
    ["FINANCE_FR1_PILOT_APPLY", "FINANCE_FR1_PILOT_APPLY_must_not_be_armed"],
    [
      "FINANCE_FR2_SETTLEMENT_PILOT_APPLY",
      "FINANCE_FR2_SETTLEMENT_PILOT_APPLY_must_not_be_armed",
    ],
    [
      "FINANCE_FR3_RECON_PILOT_VERIFY",
      "FINANCE_FR3_RECON_PILOT_VERIFY_must_not_be_armed",
    ],
    [
      "FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY",
      "FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY_must_not_be_armed",
    ],
    [
      "FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY",
      "FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY_must_not_be_armed",
    ],
  ] as const) {
    if (input.env[key] === "1") blockers.push(label);
  }

  return {
    armed,
    allowed: blockers.length === 0,
    blockers,
    projectId: blockers.some((b) => b.startsWith("project_mismatch"))
      ? null
      : FINANCE_FR6_EXPECTED_PROJECT_ID,
    expectedAdcPrincipal: FINANCE_FR6_EXPECTED_ADC_PRINCIPAL,
    allowedCollections: FINANCE_FR6_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR6_FORBIDDEN_WRITE_COLLECTIONS,
  };
}

export function buildFinanceFr6PrepChecklist(input: {
  fr5SettlementSettledPresent: boolean;
  fr5PaymentConfirmedPresent: boolean;
  fr1SnapshotImmutable: boolean;
  currencyMatch: boolean;
  amountWithinLimit: boolean;
  sourceLinked: boolean;
  sodPreparerApproverDistinct: boolean;
  createRbac: boolean;
  approveRbac: boolean;
  executeDoesNotImplyAdjust: boolean;
  fcPoliciesOk: boolean;
  expectedWritesKnown: boolean;
  forbiddenCollectionsZero: boolean;
  refundChargebackLiveNogGo: boolean;
  settledReverseLiveNoGo: boolean;
}): FinanceFr6PrepChecklistItem[] {
  return [
    {
      id: 1,
      name: "fr5_settlement_settled_present",
      pass: input.fr5SettlementSettledPresent,
      detail: "FR5 settled settlement must exist",
    },
    {
      id: 2,
      name: "fr5_payment_confirmed_retained",
      pass: input.fr5PaymentConfirmedPresent,
      detail: "FR5 confirmed payment retained (not deleted)",
    },
    {
      id: 3,
      name: "fr1_snapshot_immutable",
      pass: input.fr1SnapshotImmutable,
      detail: "FR1 snapshot principal never mutated",
    },
    {
      id: 4,
      name: "currency_match_sar",
      pass: input.currencyMatch,
      detail: "Adjustment currency matches source SAR",
    },
    {
      id: 5,
      name: "amount_within_limit",
      pass: input.amountWithinLimit,
      detail: "Adjustment amount within settlement claim",
    },
    {
      id: 6,
      name: "source_linkage_mandatory",
      pass: input.sourceLinked,
      detail: "relatedSettlementId + relatedOrderId set",
    },
    {
      id: 7,
      name: "sod_preparer_neq_approver",
      pass: input.sodPreparerApproverDistinct,
      detail: "finance:adjust actor ≠ finance:adjust_approve actor",
    },
    {
      id: 8,
      name: "rbac_finance_adjust",
      pass: input.createRbac,
      detail: "Preparer has finance:adjust",
    },
    {
      id: 9,
      name: "rbac_finance_adjust_approve",
      pass: input.approveRbac,
      detail: "Approver has finance:adjust_approve",
    },
    {
      id: 10,
      name: "execute_does_not_imply_adjust",
      pass: input.executeDoesNotImplyAdjust,
      detail: "settlements:execute alone cannot adjust",
    },
    {
      id: 11,
      name: "fc04_fc05_approved",
      pass: input.fcPoliciesOk,
      detail: "FC-04/FC-05 APPROVED",
    },
    {
      id: 12,
      name: "expected_writes_known",
      pass: input.expectedWritesKnown,
      detail: "Expected write counts locked",
    },
    {
      id: 13,
      name: "forbidden_collections_zero",
      pass: input.forbiddenCollectionsZero,
      detail: "Forbidden collections write count = 0",
    },
    {
      id: 14,
      name: "refund_chargeback_live_nogo",
      pass: input.refundChargebackLiveNogGo,
      detail: "Cash chain: refund/chargeback live NO-GO",
    },
    {
      id: 15,
      name: "settled_reverse_live_nogo",
      pass: input.settledReverseLiveNoGo,
      detail: "Settled payment reverse live NO-GO",
    },
  ];
}

export function financeFr6FcPoliciesOk(): boolean {
  return (
    isFinancePolicyApproved("FC-01") &&
    isFinancePolicyApproved("FC-02") &&
    isFinancePolicyApproved("FC-03") &&
    isFinancePolicyApproved("FC-04") &&
    isFinancePolicyApproved("FC-05")
  );
}
