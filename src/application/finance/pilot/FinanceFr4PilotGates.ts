/**
 * FR4 Settlement Approval pilot operator gates — prep checklist + live arm requirements.
 * During preparation FINANCE_WRITE_ENABLED must remain false.
 * Separation of duties: prepare ≠ approve ≠ execute.
 */

import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { isFinancePolicyApproved } from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import {
  FINANCE_FR4_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR4_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR4_EXPECTED_PROJECT_ID,
  FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR4_REQUIRED_RBAC_PERMISSION,
  FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY_ENV,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";
import { isFinanceFr4SettlementApprovalPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr4SettlementApprovalPilotApplyEnabled";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceFr4PrepChecklistItem = {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
};

export type FinanceFr4OperatorGateEnv = {
  readonly FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY?: string | undefined;
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
  readonly [key: string]: string | undefined;
};

export const FINANCE_FR4_REQUIRED_RBAC_PERMISSIONS: readonly FinancePermission[] =
  ["finance:read", FINANCE_FR4_REQUIRED_RBAC_PERMISSION];

export function assertFinanceFr4PrepWriteDisabled(
  env: FinanceFr4OperatorGateEnv = process.env,
): void {
  if (env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error(
      "FINANCE_WRITE_ENABLED must remain false during FR4 Settlement Approval pilot preparation",
    );
  }
  if (FINANCE_WRITE_ENABLED_DEFAULT !== false) {
    throw new Error("FINANCE_WRITE_ENABLED_DEFAULT must be false");
  }
}

export function evaluateFinanceFr4LiveArmGates(input: {
  env: FinanceFr4OperatorGateEnv;
  mode: "preparation" | "live_apply";
}): {
  armed: boolean;
  allowed: boolean;
  blockers: string[];
  projectId: typeof FINANCE_FR4_EXPECTED_PROJECT_ID | null;
  expectedAdcPrincipal: typeof FINANCE_FR4_EXPECTED_ADC_PRINCIPAL;
  allowedCollections: typeof FINANCE_FR4_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS;
} {
  const blockers: string[] = [];
  const armed = isFinanceFr4SettlementApprovalPilotApplyEnabled(
    input.env[FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY_ENV],
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
      projectId: FINANCE_FR4_EXPECTED_PROJECT_ID,
      expectedAdcPrincipal: FINANCE_FR4_EXPECTED_ADC_PRINCIPAL,
      allowedCollections: FINANCE_FR4_ALLOWED_WRITE_COLLECTIONS,
      forbiddenCollections: FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS,
    };
  }

  // live_apply — FR2 draft → approval/lock (independent FINANCE_WRITE_ENABLED)
  if (!armed) blockers.push("FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY!=1");
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
    projectId !== FINANCE_FR4_EXPECTED_PROJECT_ID ||
    gcp !== FINANCE_FR4_EXPECTED_PROJECT_ID
  ) {
    blockers.push(
      `project_mismatch:expected=${FINANCE_FR4_EXPECTED_PROJECT_ID}`,
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
    source !== "fr2_settlement_draft" &&
    source !== "fr2_settlement" &&
    source !== "settlement_v2_draft"
  ) {
    blockers.push("SOURCE_must_be_fr2_settlement_draft");
  }

  // Never allow concurrent FR1/FR2/FR3 live arms in the same session.
  if (input.env.FINANCE_FR1_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR1_PILOT_APPLY_must_not_be_armed");
  }
  if (input.env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR2_SETTLEMENT_PILOT_APPLY_must_not_be_armed");
  }
  if (input.env.FINANCE_FR3_RECON_PILOT_VERIFY === "1") {
    blockers.push("FINANCE_FR3_RECON_PILOT_VERIFY_must_not_be_armed");
  }

  return {
    armed,
    allowed: blockers.length === 0,
    blockers,
    projectId: blockers.some((b) => b.startsWith("project_mismatch"))
      ? null
      : FINANCE_FR4_EXPECTED_PROJECT_ID,
    expectedAdcPrincipal: FINANCE_FR4_EXPECTED_ADC_PRINCIPAL,
    allowedCollections: FINANCE_FR4_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS,
  };
}

export function buildFinanceFr4PrepChecklist(input: {
  fr2SettlementDraftPresent: boolean;
  fr2IdempotencyComplete: boolean;
  fr3ReconPass: boolean;
  noPriorFr4Approval: boolean;
  currencyMatch: boolean;
  amountsImmutable: boolean;
  directionImmutable: boolean;
  sourceImmutable: boolean;
  dualControlPossible: boolean;
  financeRbac: boolean;
  fcPoliciesOk: boolean;
  approvalDistinctFromExecute: boolean;
  expectedWritesKnown: boolean;
  nonFinanceWritesForbidden: boolean;
  paymentExecutionForbidden: boolean;
}): FinanceFr4PrepChecklistItem[] {
  return [
    {
      id: 1,
      name: "verify_fr2_settlement_draft_present",
      pass: input.fr2SettlementDraftPresent,
      detail: input.fr2SettlementDraftPresent
        ? "fr2_settlement_draft_present"
        : "fr2_settlement_draft_missing",
    },
    {
      id: 2,
      name: "verify_fr2_idempotency_complete",
      pass: input.fr2IdempotencyComplete,
      detail: input.fr2IdempotencyComplete
        ? "fr2_idempotency_applied"
        : "fr2_idempotency_missing",
    },
    {
      id: 3,
      name: "verify_fr3_recon_pass",
      pass: input.fr3ReconPass,
      detail: input.fr3ReconPass ? "fr3_recon_pass" : "fr3_recon_not_pass",
    },
    {
      id: 4,
      name: "verify_no_prior_fr4_approval",
      pass: input.noPriorFr4Approval,
      detail: input.noPriorFr4Approval
        ? "no_prior_fr4"
        : "fr4_approval_already_exists",
    },
    {
      id: 5,
      name: "verify_currency_immutable",
      pass: input.currencyMatch,
      detail: input.currencyMatch ? "currency=SAR" : "currency_mismatch",
    },
    {
      id: 6,
      name: "verify_amounts_immutable",
      pass: input.amountsImmutable,
      detail: input.amountsImmutable
        ? "amountMinor=1500_paidConfirmed=0"
        : "amount_or_paid_changed",
    },
    {
      id: 7,
      name: "verify_direction_immutable",
      pass: input.directionImmutable,
      detail: input.directionImmutable
        ? "direction=DRIVER_PAYS_COMPANY"
        : "direction_changed",
    },
    {
      id: 8,
      name: "verify_source_immutable",
      pass: input.sourceImmutable,
      detail: input.sourceImmutable
        ? "source_fr1_snapshot_unchanged"
        : "source_changed",
    },
    {
      id: 9,
      name: "prove_dual_control_prepare_neq_approve",
      pass: input.dualControlPossible,
      detail: input.dualControlPossible
        ? "approver_neq_creator_enforced"
        : "dual_control_not_proven",
    },
    {
      id: 10,
      name: "prove_finance_rbac_approve",
      pass: input.financeRbac,
      detail: input.financeRbac
        ? FINANCE_FR4_REQUIRED_RBAC_PERMISSIONS.join(",")
        : "rbac_fail",
    },
    {
      id: 11,
      name: "verify_fc_policies",
      pass:
        input.fcPoliciesOk &&
        isFinancePolicyApproved("FC-01") &&
        isFinancePolicyApproved("FC-02") &&
        isFinancePolicyApproved("FC-03") &&
        isFinancePolicyApproved("FC-04") &&
        isFinancePolicyApproved("FC-05"),
      detail: input.fcPoliciesOk ? "FC-01..05_APPROVED" : "fc_policy_fail",
    },
    {
      id: 12,
      name: "prove_approval_distinct_from_execute_payout",
      pass: input.approvalDistinctFromExecute,
      detail: input.approvalDistinctFromExecute
        ? "approve_neq_execute_payout"
        : "approval_conflated_with_execute",
    },
    {
      id: 13,
      name: "calculate_exact_expected_write_counts",
      pass: input.expectedWritesKnown,
      detail: input.expectedWritesKnown ? "writes_known_4" : "writes_unknown",
    },
    {
      id: 14,
      name: "prove_forbidden_writes_zero",
      pass: input.nonFinanceWritesForbidden,
      detail: input.nonFinanceWritesForbidden
        ? FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS.join(",")
        : "forbidden_writes_not_proven",
    },
    {
      id: 15,
      name: "prove_payment_execution_forbidden",
      pass: input.paymentExecutionForbidden,
      detail: input.paymentExecutionForbidden
        ? "payment_payout_forbidden"
        : "payment_path_not_blocked",
    },
  ];
}

export function actorHasFinanceFr4Rbac(
  permissions: FinancePermission[],
): boolean {
  return (
    permissions.includes("finance:read") &&
    permissions.includes("settlements:approve")
  );
}
