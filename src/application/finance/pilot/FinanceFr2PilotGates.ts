/**
 * FR2 Settlement V2 pilot operator gates — prep checklist + live arm requirements.
 * During preparation FINANCE_WRITE_ENABLED must remain false.
 */

import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { isFinancePolicyApproved } from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import {
  FINANCE_FR2_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR2_EXPECTED_PROJECT_ID,
  FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR2_SETTLEMENT_PILOT_APPLY_ENV,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { isFinanceFr2SettlementPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr2SettlementPilotApplyEnabled";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceFr2PrepChecklistItem = {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
};

export type FinanceFr2OperatorGateEnv = {
  readonly FINANCE_FR2_SETTLEMENT_PILOT_APPLY?: string | undefined;
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
  readonly [key: string]: string | undefined;
};

export const FINANCE_FR2_REQUIRED_RBAC_PERMISSIONS: readonly FinancePermission[] =
  ["finance:read", "settlements:prepare"];

export function assertFinanceFr2PrepWriteDisabled(
  env: FinanceFr2OperatorGateEnv = process.env,
): void {
  if (env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error(
      "FINANCE_WRITE_ENABLED must remain false during FR2 Settlement V2 pilot preparation",
    );
  }
  if (FINANCE_WRITE_ENABLED_DEFAULT !== false) {
    throw new Error("FINANCE_WRITE_ENABLED_DEFAULT must be false");
  }
}

export function evaluateFinanceFr2LiveArmGates(input: {
  env: FinanceFr2OperatorGateEnv;
  mode: "preparation" | "live_apply";
}): {
  armed: boolean;
  allowed: boolean;
  blockers: string[];
  projectId: typeof FINANCE_FR2_EXPECTED_PROJECT_ID | null;
  expectedAdcPrincipal: typeof FINANCE_FR2_EXPECTED_ADC_PRINCIPAL;
  allowedCollections: typeof FINANCE_FR2_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS;
} {
  const blockers: string[] = [];
  const armed = isFinanceFr2SettlementPilotApplyEnabled(
    input.env[FINANCE_FR2_SETTLEMENT_PILOT_APPLY_ENV],
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
      projectId: FINANCE_FR2_EXPECTED_PROJECT_ID,
      expectedAdcPrincipal: FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
      allowedCollections: FINANCE_FR2_ALLOWED_WRITE_COLLECTIONS,
      forbiddenCollections: FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS,
    };
  }

  // live_apply — FR1 snapshot → Settlement V2 (independent FINANCE_WRITE_ENABLED)
  if (!armed) blockers.push("FINANCE_FR2_SETTLEMENT_PILOT_APPLY!=1");
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
    projectId !== FINANCE_FR2_EXPECTED_PROJECT_ID ||
    gcp !== FINANCE_FR2_EXPECTED_PROJECT_ID
  ) {
    blockers.push(
      `project_mismatch:expected=${FINANCE_FR2_EXPECTED_PROJECT_ID}`,
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
  if (source !== "fr1_snapshot" && source !== "fr1_accounting_snapshot") {
    blockers.push("SOURCE_must_be_fr1_snapshot");
  }

  // Never allow concurrent FR1 live arm in the same session.
  if (input.env.FINANCE_FR1_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR1_PILOT_APPLY_must_not_be_armed");
  }

  return {
    armed,
    allowed: blockers.length === 0,
    blockers,
    projectId: blockers.some((b) => b.startsWith("project_mismatch"))
      ? null
      : FINANCE_FR2_EXPECTED_PROJECT_ID,
    expectedAdcPrincipal: FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
    allowedCollections: FINANCE_FR2_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS,
  };
}

export function buildFinanceFr2PrepChecklist(input: {
  fr1SnapshotComplete: boolean;
  fr1IdempotencyComplete: boolean;
  noPriorFr2Settlement: boolean;
  currencyMatch: boolean;
  valuesReconcileToFr1: boolean;
  financeRbac: boolean;
  countryScopeOk: boolean;
  fcPoliciesOk: boolean;
  noMissingRequiredValues: boolean;
  noDuplicateSettlement: boolean;
  calculated: boolean;
  expectedWritesKnown: boolean;
  nonFinanceWritesForbidden: boolean;
  paymentExecutionForbidden: boolean;
}): FinanceFr2PrepChecklistItem[] {
  return [
    {
      id: 1,
      name: "verify_fr1_snapshot_complete",
      pass: input.fr1SnapshotComplete,
      detail: input.fr1SnapshotComplete
        ? "fr1_snapshot_complete"
        : "fr1_snapshot_incomplete",
    },
    {
      id: 2,
      name: "verify_fr1_idempotency_complete",
      pass: input.fr1IdempotencyComplete,
      detail: input.fr1IdempotencyComplete
        ? "fr1_idempotency_applied"
        : "fr1_idempotency_missing",
    },
    {
      id: 3,
      name: "verify_no_existing_fr2_settlement_pilot",
      pass: input.noPriorFr2Settlement,
      detail: input.noPriorFr2Settlement
        ? "no_prior_fr2"
        : "fr2_settlement_already_exists",
    },
    {
      id: 4,
      name: "verify_currency_match",
      pass: input.currencyMatch,
      detail: input.currencyMatch ? "currency=SAR" : "currency_mismatch",
    },
    {
      id: 5,
      name: "verify_values_reconcile_to_fr1",
      pass: input.valuesReconcileToFr1,
      detail: input.valuesReconcileToFr1
        ? "reconciles_to_fr1"
        : "settlement_amount_mismatch",
    },
    {
      id: 6,
      name: "prove_finance_rbac",
      pass: input.financeRbac,
      detail: input.financeRbac
        ? FINANCE_FR2_REQUIRED_RBAC_PERMISSIONS.join(",")
        : "rbac_fail",
    },
    {
      id: 7,
      name: "verify_country_scope",
      pass: input.countryScopeOk,
      detail: input.countryScopeOk ? "country_ok" : "country_scope_fail",
    },
    {
      id: 8,
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
      id: 9,
      name: "verify_no_missing_required_values",
      pass: input.noMissingRequiredValues,
      detail: input.noMissingRequiredValues
        ? "required_values_present"
        : "missing_required_values",
    },
    {
      id: 10,
      name: "verify_no_duplicate_settlement",
      pass: input.noDuplicateSettlement,
      detail: input.noDuplicateSettlement
        ? "no_duplicate"
        : "duplicate_settlement_risk",
    },
    {
      id: 11,
      name: "calculate_exact_settlement_amounts",
      pass: input.calculated,
      detail: input.calculated ? "settlement_calculated" : "not_calculated",
    },
    {
      id: 12,
      name: "calculate_exact_expected_write_counts",
      pass: input.expectedWritesKnown,
      detail: input.expectedWritesKnown ? "writes_known" : "writes_unknown",
    },
    {
      id: 13,
      name: "prove_forbidden_writes_zero",
      pass: input.nonFinanceWritesForbidden,
      detail: input.nonFinanceWritesForbidden
        ? FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS.join(",")
        : "forbidden_writes_not_proven",
    },
    {
      id: 14,
      name: "prove_payment_execution_forbidden",
      pass: input.paymentExecutionForbidden,
      detail: input.paymentExecutionForbidden
        ? "payment_payout_forbidden"
        : "payment_path_not_blocked",
    },
  ];
}

export function actorHasFinanceFr2Rbac(
  permissions: FinancePermission[],
): boolean {
  const prepareOk =
    permissions.includes("settlements:prepare") ||
    permissions.includes("settlements:create");
  return permissions.includes("finance:read") && prepareOk;
}
