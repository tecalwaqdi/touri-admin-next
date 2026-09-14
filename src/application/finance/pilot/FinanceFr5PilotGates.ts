/**
 * FR5 Settlement Execution pilot operator gates — prep checklist + live arm.
 * During preparation FINANCE_WRITE_ENABLED must remain false.
 * SoD: prepare ≠ approve ≠ execute; settlements:approve must NOT imply execute.
 */

import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { isFinancePolicyApproved } from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import {
  FINANCE_FR5_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR5_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR5_EXPECTED_PROJECT_ID,
  FINANCE_FR5_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR5_REQUIRED_RBAC_PERMISSION,
  FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY_ENV,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import { isFinanceFr5SettlementExecutionPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr5SettlementExecutionPilotApplyEnabled";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceFr5PrepChecklistItem = {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
};

export type FinanceFr5OperatorGateEnv = {
  readonly FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY?: string | undefined;
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
  readonly [key: string]: string | undefined;
};

export const FINANCE_FR5_REQUIRED_RBAC_PERMISSIONS: readonly FinancePermission[] =
  ["finance:read", FINANCE_FR5_REQUIRED_RBAC_PERMISSION];

export function assertFinanceFr5PrepWriteDisabled(
  env: FinanceFr5OperatorGateEnv = process.env,
): void {
  if (env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error(
      "FINANCE_WRITE_ENABLED must remain false during FR5 Settlement Execution pilot preparation",
    );
  }
  if (FINANCE_WRITE_ENABLED_DEFAULT !== false) {
    throw new Error("FINANCE_WRITE_ENABLED_DEFAULT must be false");
  }
}

export function evaluateFinanceFr5LiveArmGates(input: {
  env: FinanceFr5OperatorGateEnv;
  mode: "preparation" | "live_apply";
}): {
  armed: boolean;
  allowed: boolean;
  blockers: string[];
  projectId: typeof FINANCE_FR5_EXPECTED_PROJECT_ID | null;
  expectedAdcPrincipal: typeof FINANCE_FR5_EXPECTED_ADC_PRINCIPAL;
  allowedCollections: typeof FINANCE_FR5_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR5_FORBIDDEN_WRITE_COLLECTIONS;
} {
  const blockers: string[] = [];
  const armed = isFinanceFr5SettlementExecutionPilotApplyEnabled(
    input.env[FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY_ENV],
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
      projectId: FINANCE_FR5_EXPECTED_PROJECT_ID,
      expectedAdcPrincipal: FINANCE_FR5_EXPECTED_ADC_PRINCIPAL,
      allowedCollections: FINANCE_FR5_ALLOWED_WRITE_COLLECTIONS,
      forbiddenCollections: FINANCE_FR5_FORBIDDEN_WRITE_COLLECTIONS,
    };
  }

  if (!armed) blockers.push("FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY!=1");
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
    projectId !== FINANCE_FR5_EXPECTED_PROJECT_ID ||
    gcp !== FINANCE_FR5_EXPECTED_PROJECT_ID
  ) {
    blockers.push(
      `project_mismatch:expected=${FINANCE_FR5_EXPECTED_PROJECT_ID}`,
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
    source !== "fr4_settlement_locked" &&
    source !== "fr4_locked" &&
    source !== "settlement_v2_locked"
  ) {
    blockers.push("SOURCE_must_be_fr4_settlement_locked");
  }

  if (input.env.FINANCE_FR1_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR1_PILOT_APPLY_must_not_be_armed");
  }
  if (input.env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR2_SETTLEMENT_PILOT_APPLY_must_not_be_armed");
  }
  if (input.env.FINANCE_FR3_RECON_PILOT_VERIFY === "1") {
    blockers.push("FINANCE_FR3_RECON_PILOT_VERIFY_must_not_be_armed");
  }
  if (input.env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY_must_not_be_armed");
  }

  return {
    armed,
    allowed: blockers.length === 0,
    blockers,
    projectId: blockers.some((b) => b.startsWith("project_mismatch"))
      ? null
      : FINANCE_FR5_EXPECTED_PROJECT_ID,
    expectedAdcPrincipal: FINANCE_FR5_EXPECTED_ADC_PRINCIPAL,
    allowedCollections: FINANCE_FR5_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR5_FORBIDDEN_WRITE_COLLECTIONS,
  };
}

export function buildFinanceFr5PrepChecklist(input: {
  fr4SettlementLockedPresent: boolean;
  fr4IdempotencyComplete: boolean;
  fr3ReconPass: boolean;
  noPriorFr5Execution: boolean;
  currencyMatch: boolean;
  amountUnchanged: boolean;
  paidStartsZero: boolean;
  directionImmutable: boolean;
  sourceImmutable: boolean;
  sodExecutorDistinct: boolean;
  financeRbac: boolean;
  approveDoesNotImplyExecute: boolean;
  fcPoliciesOk: boolean;
  expectedWritesKnown: boolean;
  forbiddenCollectionsZero: boolean;
  noWalletNoPayout: boolean;
}): FinanceFr5PrepChecklistItem[] {
  return [
    {
      id: 1,
      name: "verify_fr4_settlement_locked_present",
      pass: input.fr4SettlementLockedPresent,
      detail: input.fr4SettlementLockedPresent
        ? "fr4_settlement_locked_present"
        : "fr4_settlement_locked_missing",
    },
    {
      id: 2,
      name: "verify_fr4_idempotency_complete",
      pass: input.fr4IdempotencyComplete,
      detail: input.fr4IdempotencyComplete
        ? "fr4_idempotency_applied"
        : "fr4_idempotency_missing",
    },
    {
      id: 3,
      name: "verify_fr3_recon_pass",
      pass: input.fr3ReconPass,
      detail: input.fr3ReconPass ? "fr3_recon_pass" : "fr3_recon_not_pass",
    },
    {
      id: 4,
      name: "verify_no_prior_fr5_execution",
      pass: input.noPriorFr5Execution,
      detail: input.noPriorFr5Execution
        ? "no_prior_fr5"
        : "fr5_execution_already_exists",
    },
    {
      id: 5,
      name: "verify_currency_immutable",
      pass: input.currencyMatch,
      detail: input.currencyMatch ? "currency=SAR" : "currency_mismatch",
    },
    {
      id: 6,
      name: "verify_amount_minor_unchanged",
      pass: input.amountUnchanged,
      detail: input.amountUnchanged
        ? "amountMinor=1500_unchanged"
        : "amountMinor_changed",
    },
    {
      id: 7,
      name: "verify_paid_starts_zero",
      pass: input.paidStartsZero,
      detail: input.paidStartsZero
        ? "paidConfirmed=0_pre_execution"
        : "paidConfirmed_not_0",
    },
    {
      id: 8,
      name: "verify_direction_immutable",
      pass: input.directionImmutable,
      detail: input.directionImmutable
        ? "direction=DRIVER_PAYS_COMPANY"
        : "direction_changed",
    },
    {
      id: 9,
      name: "verify_source_immutable",
      pass: input.sourceImmutable,
      detail: input.sourceImmutable
        ? "source=fr1_snapshot"
        : "source_changed",
    },
    {
      id: 10,
      name: "verify_sod_executor_distinct",
      pass: input.sodExecutorDistinct,
      detail: input.sodExecutorDistinct
        ? "prepare≠approve≠execute"
        : "sod_violation",
    },
    {
      id: 11,
      name: "verify_finance_rbac_execute",
      pass: input.financeRbac,
      detail: input.financeRbac
        ? "settlements:execute"
        : "rbac_execute_missing",
    },
    {
      id: 12,
      name: "verify_approve_does_not_imply_execute",
      pass: input.approveDoesNotImplyExecute,
      detail: input.approveDoesNotImplyExecute
        ? "approve_not_execute"
        : "approve_implies_execute_forbidden",
    },
    {
      id: 13,
      name: "verify_fc_policies_ok",
      pass: input.fcPoliciesOk,
      detail: input.fcPoliciesOk ? "FC-01..05_APPROVED" : "fc_policy_fail",
    },
    {
      id: 14,
      name: "verify_expected_writes_known",
      pass: input.expectedWritesKnown,
      detail: input.expectedWritesKnown
        ? "expected_writes=5"
        : "expected_writes_unknown",
    },
    {
      id: 15,
      name: "verify_forbidden_collections_zero",
      pass: input.forbiddenCollectionsZero,
      detail: input.forbiddenCollectionsZero
        ? "forbidden_collections_documented"
        : "forbidden_collections_unclear",
    },
    {
      id: 16,
      name: "verify_no_wallet_no_payout",
      pass: input.noWalletNoPayout,
      detail: input.noWalletNoPayout
        ? "no_wallet_no_payout"
        : "wallet_or_payout_forbidden",
    },
  ];
}

export function actorHasFinanceFr5Rbac(
  permissions: readonly string[],
): boolean {
  return (
    permissions.includes("finance:read") &&
    permissions.includes(FINANCE_FR5_REQUIRED_RBAC_PERMISSION)
  );
}

export function financeFr5FcPoliciesOk(): boolean {
  return (
    isFinancePolicyApproved("FC-01") &&
    isFinancePolicyApproved("FC-02") &&
    isFinancePolicyApproved("FC-03") &&
    isFinancePolicyApproved("FC-04") &&
    isFinancePolicyApproved("FC-05")
  );
}
