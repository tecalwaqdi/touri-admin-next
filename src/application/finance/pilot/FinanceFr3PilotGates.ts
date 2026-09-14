/**
 * FR3 Reconciliation pilot gates — prep checklist + read-only live verify gates.
 * Persistence not required by design → no write arm / no apply harness.
 * During preparation FINANCE_WRITE_ENABLED must remain false.
 */

import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { isFinancePolicyApproved } from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import {
  FINANCE_FR3_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR3_EXPECTED_PROJECT_ID,
  FINANCE_FR3_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR3_PERSISTENCE_MODE,
  FINANCE_FR3_RECON_PILOT_VERIFY_ENV,
  FINANCE_FR3_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr3PilotConstants";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceFr3PrepChecklistItem = {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
};

export type FinanceFr3OperatorGateEnv = {
  readonly FINANCE_FR3_RECON_PILOT_VERIFY?: string | undefined;
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
  readonly [key: string]: string | undefined;
};

export const FINANCE_FR3_REQUIRED_RBAC_PERMISSIONS: readonly FinancePermission[] =
  ["finance:read"];

export function isFinanceFr3ReconPilotVerifyEnabled(
  value?: string | undefined | null,
): boolean {
  return String(value ?? "").trim() === "1";
}

export function assertFinanceFr3PrepWriteDisabled(
  env: FinanceFr3OperatorGateEnv = process.env,
): void {
  if (env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error(
      "FINANCE_WRITE_ENABLED must remain false during FR3 Reconciliation pilot preparation",
    );
  }
  if (FINANCE_WRITE_ENABLED_DEFAULT !== false) {
    throw new Error("FINANCE_WRITE_ENABLED_DEFAULT must be false");
  }
}

/**
 * Live verify is read-only. Never allows Finance/domain writes.
 */
export function evaluateFinanceFr3LiveVerifyGates(input: {
  env: FinanceFr3OperatorGateEnv;
  mode: "preparation" | "live_verify";
}): {
  armed: boolean;
  allowed: boolean;
  blockers: string[];
  persistenceMode: typeof FINANCE_FR3_PERSISTENCE_MODE;
  projectId: typeof FINANCE_FR3_EXPECTED_PROJECT_ID | null;
  expectedAdcPrincipal: typeof FINANCE_FR3_EXPECTED_ADC_PRINCIPAL;
  expectedWrites: typeof FINANCE_FR3_ZERO_WRITE_COUNTS;
} {
  const blockers: string[] = [];
  const armed = isFinanceFr3ReconPilotVerifyEnabled(
    input.env[FINANCE_FR3_RECON_PILOT_VERIFY_ENV],
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
        "preparation_mode_no_live_verify",
        ...(armed ? ["verify_armed_but_prep_refuses_live"] : []),
      ],
      persistenceMode: FINANCE_FR3_PERSISTENCE_MODE,
      projectId: FINANCE_FR3_EXPECTED_PROJECT_ID,
      expectedAdcPrincipal: FINANCE_FR3_EXPECTED_ADC_PRINCIPAL,
      expectedWrites: FINANCE_FR3_ZERO_WRITE_COUNTS,
    };
  }

  if (!armed) blockers.push("FINANCE_FR3_RECON_PILOT_VERIFY!=1");
  if (input.env.FINANCE_WRITE_ENABLED === "true") {
    blockers.push("FINANCE_WRITE_ENABLED_must_be_false_for_read_only_fr3");
  }
  if (input.env.GLOBAL_PRODUCTION_WRITE_ENABLED === "true") {
    blockers.push("GLOBAL_PRODUCTION_WRITE_ENABLED_must_be_false");
  }
  if (input.env.PRODUCTION_WRITE_ENABLED === "true") {
    blockers.push("PRODUCTION_WRITE_ENABLED_must_be_false");
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

  const projectId = (input.env.EXPECTED_PROJECT_ID ?? "").trim();
  const gcp = (input.env.GOOGLE_CLOUD_PROJECT ?? "").trim();
  if (
    projectId !== FINANCE_FR3_EXPECTED_PROJECT_ID ||
    gcp !== FINANCE_FR3_EXPECTED_PROJECT_ID
  ) {
    blockers.push(
      `project_mismatch:expected=${FINANCE_FR3_EXPECTED_PROJECT_ID}`,
    );
  }

  const source = (input.env.SOURCE ?? "").trim().toLowerCase();
  if (
    source !== "fr1_fr2_read_only" &&
    source !== "fr1_snapshot_fr2_settlement"
  ) {
    blockers.push("SOURCE_must_be_fr1_fr2_read_only");
  }

  if (input.env.FINANCE_FR1_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR1_PILOT_APPLY_must_not_be_armed");
  }
  if (input.env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR2_SETTLEMENT_PILOT_APPLY_must_not_be_armed");
  }

  return {
    armed,
    allowed: blockers.length === 0,
    blockers,
    persistenceMode: FINANCE_FR3_PERSISTENCE_MODE,
    projectId: blockers.some((b) => b.startsWith("project_mismatch"))
      ? null
      : FINANCE_FR3_EXPECTED_PROJECT_ID,
    expectedAdcPrincipal: FINANCE_FR3_EXPECTED_ADC_PRINCIPAL,
    expectedWrites: FINANCE_FR3_ZERO_WRITE_COUNTS,
  };
}

export function buildFinanceFr3PrepChecklist(input: {
  fr1SnapshotComplete: boolean;
  fr2SettlementComplete: boolean;
  fr1IdempotencyComplete: boolean;
  fr2IdempotencyComplete: boolean;
  currencyMatch: boolean;
  directionMatch: boolean;
  claimMatchesCommission: boolean;
  outstandingOk: boolean;
  financeRbac: boolean;
  countryScopeOk: boolean;
  fcPoliciesOk: boolean;
  noMissingRequiredValues: boolean;
  snapshotImmutable: boolean;
  settlementNotRewritten: boolean;
  reconPass: boolean;
  expectedWritesZero: boolean;
  persistenceReadOnly: boolean;
}): FinanceFr3PrepChecklistItem[] {
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
      name: "verify_fr2_settlement_complete",
      pass: input.fr2SettlementComplete,
      detail: input.fr2SettlementComplete
        ? "fr2_settlement_complete"
        : "fr2_settlement_incomplete",
    },
    {
      id: 3,
      name: "verify_fr1_idempotency_complete",
      pass: input.fr1IdempotencyComplete,
      detail: input.fr1IdempotencyComplete
        ? "fr1_idempotency_applied"
        : "fr1_idempotency_missing",
    },
    {
      id: 4,
      name: "verify_fr2_idempotency_complete",
      pass: input.fr2IdempotencyComplete,
      detail: input.fr2IdempotencyComplete
        ? "fr2_idempotency_applied"
        : "fr2_idempotency_missing",
    },
    {
      id: 5,
      name: "verify_currency_match",
      pass: input.currencyMatch,
      detail: input.currencyMatch ? "currency=SAR" : "currency_mismatch",
    },
    {
      id: 6,
      name: "verify_direction_match",
      pass: input.directionMatch,
      detail: input.directionMatch
        ? "DRIVER_PAYS_COMPANY"
        : "direction_mismatch",
    },
    {
      id: 7,
      name: "verify_claim_matches_commission",
      pass: input.claimMatchesCommission,
      detail: input.claimMatchesCommission
        ? "claim=commission=1500"
        : "claim_commission_mismatch",
    },
    {
      id: 8,
      name: "verify_outstanding_unpaid",
      pass: input.outstandingOk,
      detail: input.outstandingOk
        ? "paid=0_outstanding=1500"
        : "outstanding_mismatch",
    },
    {
      id: 9,
      name: "prove_finance_rbac",
      pass: input.financeRbac,
      detail: input.financeRbac
        ? FINANCE_FR3_REQUIRED_RBAC_PERMISSIONS.join(",")
        : "rbac_fail",
    },
    {
      id: 10,
      name: "verify_country_scope",
      pass: input.countryScopeOk,
      detail: input.countryScopeOk ? "country_ok" : "country_scope_fail",
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
      name: "verify_no_missing_required_values",
      pass: input.noMissingRequiredValues,
      detail: input.noMissingRequiredValues
        ? "required_values_present"
        : "missing_required_values",
    },
    {
      id: 13,
      name: "prove_snapshot_immutable",
      pass: input.snapshotImmutable,
      detail: input.snapshotImmutable
        ? "historical_snapshot_immutable"
        : "snapshot_mutable_or_rerate",
    },
    {
      id: 14,
      name: "prove_settlement_not_rewritten_for_recon",
      pass: input.settlementNotRewritten,
      detail: input.settlementNotRewritten
        ? "settlement_amounts_untouched"
        : "settlement_rewrite_forbidden",
    },
    {
      id: 15,
      name: "reconcile_fr1_fr2_pass",
      pass: input.reconPass,
      detail: input.reconPass ? "recon_PASS" : "recon_NO-GO",
    },
    {
      id: 16,
      name: "prove_expected_writes_zero",
      pass: input.expectedWritesZero,
      detail: input.expectedWritesZero
        ? "production_writes=0"
        : "unexpected_write_expectation",
    },
    {
      id: 17,
      name: "prove_persistence_read_only",
      pass: input.persistenceReadOnly,
      detail: input.persistenceReadOnly
        ? FINANCE_FR3_PERSISTENCE_MODE
        : "persistence_not_read_only",
    },
    {
      id: 18,
      name: "prove_forbidden_collections",
      pass: FINANCE_FR3_FORBIDDEN_WRITE_COLLECTIONS.length > 0,
      detail: FINANCE_FR3_FORBIDDEN_WRITE_COLLECTIONS.join(","),
    },
  ];
}

export function actorHasFinanceFr3Rbac(
  permissions: FinancePermission[],
): boolean {
  return permissions.includes("finance:read");
}
