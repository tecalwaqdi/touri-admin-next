/**
 * FR1 pilot operator gates — prep checklist 1–14 + live arm requirements.
 * During preparation FINANCE_WRITE_ENABLED must remain false.
 */

import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { requireFc01ApprovedPlatformCommissionRate } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import { isFinancePolicyApproved } from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import {
  FINANCE_FR1_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR1_PILOT_APPLY_ENV,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import { isFinanceFr1PilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr1PilotApplyEnabled";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceFr1PrepChecklistItem = {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
};

export type FinanceFr1OperatorGateEnv = {
  readonly FINANCE_FR1_PILOT_APPLY?: string | undefined;
  readonly FINANCE_FR1_REGISTRY_PILOT?: string | undefined;
  readonly FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE?: string | undefined;
  readonly SOURCE?: string | undefined;
  readonly TARGET?: string | undefined;
  readonly DOCUMENT_ID?: string | undefined;
  readonly IDEMPOTENCY_KEY?: string | undefined;
  readonly FINANCE_WRITE_ENABLED?: string | undefined;
  readonly EXPECTED_PROJECT_ID?: string | undefined;
  readonly GOOGLE_CLOUD_PROJECT?: string | undefined;
  readonly GLOBAL_PRODUCTION_WRITE_ENABLED?: string | undefined;
  readonly PRODUCTION_WRITE_ENABLED?: string | undefined;
  readonly DRIVER_WRITE_ENABLED?: string | undefined;
  readonly AGENT_WRITE_ENABLED?: string | undefined;
  readonly CUSTOMER_WRITE_ENABLED?: string | undefined;
  readonly [key: string]: string | undefined;
};

export const FINANCE_FR1_REQUIRED_RBAC_PERMISSIONS: readonly FinancePermission[] =
  ["finance:read", "settlements:prepare"];

export function assertFinanceFr1PrepWriteDisabled(
  env: FinanceFr1OperatorGateEnv = process.env,
): void {
  if (env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error(
      "FINANCE_WRITE_ENABLED must remain false during FR1 pilot preparation",
    );
  }
  if (FINANCE_WRITE_ENABLED_DEFAULT !== false) {
    throw new Error("FINANCE_WRITE_ENABLED_DEFAULT must be false");
  }
}

export function evaluateFinanceFr1LiveArmGates(input: {
  env: FinanceFr1OperatorGateEnv;
  mode: "preparation" | "live_apply";
}): {
  armed: boolean;
  allowed: boolean;
  blockers: string[];
  projectId: typeof FINANCE_FR1_EXPECTED_PROJECT_ID | null;
  expectedAdcPrincipal: typeof FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;
  allowedCollections: typeof FINANCE_FR1_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS;
} {
  const blockers: string[] = [];
  const armed = isFinanceFr1PilotApplyEnabled(
    input.env[FINANCE_FR1_PILOT_APPLY_ENV],
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
      projectId: FINANCE_FR1_EXPECTED_PROJECT_ID,
      expectedAdcPrincipal: FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
      allowedCollections: FINANCE_FR1_ALLOWED_WRITE_COLLECTIONS,
      forbiddenCollections: FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS,
    };
  }

  // live_apply — registry-only FR1 Finance pilot (independent FINANCE_WRITE_ENABLED)
  if (!armed) blockers.push("FINANCE_FR1_PILOT_APPLY!=1");
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
    projectId !== FINANCE_FR1_EXPECTED_PROJECT_ID ||
    gcp !== FINANCE_FR1_EXPECTED_PROJECT_ID
  ) {
    blockers.push(
      `project_mismatch:expected=${FINANCE_FR1_EXPECTED_PROJECT_ID}`,
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
  if (source !== "registry" && source !== "registry_fixture") {
    blockers.push("SOURCE_must_be_registry");
  }
  if (input.env.FINANCE_FR1_REGISTRY_PILOT !== "1") {
    blockers.push("FINANCE_FR1_REGISTRY_PILOT!=1");
  }

  return {
    armed,
    allowed: blockers.length === 0,
    blockers,
    projectId:
      blockers.some((b) => b.startsWith("project_mismatch"))
        ? null
        : FINANCE_FR1_EXPECTED_PROJECT_ID,
    expectedAdcPrincipal: FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
    allowedCollections: FINANCE_FR1_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS,
  };
}

export function buildFinanceFr1PrepChecklist(input: {
  candidateFound: boolean;
  classification: string | null;
  lifecycleCompleted: boolean;
  currencyPresent: boolean;
  majorsComplete: boolean;
  fc01RateResolves: boolean;
  discountOk: boolean;
  driverNetPresent: boolean;
  agentOk: boolean;
  noPriorSnapshot: boolean;
  reconciliationOk: boolean;
  calculated: boolean;
  expectedWritesKnown: boolean;
  rbacPass: boolean;
  nonFinanceWritesForbidden: boolean;
}): FinanceFr1PrepChecklistItem[] {
  return [
    {
      id: 1,
      name: "identify_exact_pilot_trip",
      pass: input.candidateFound,
      detail: input.candidateFound
        ? `classification=${input.classification}`
        : "no_safe_synthetic_test_trip",
    },
    {
      id: 2,
      name: "verify_completed_eligible",
      pass: input.lifecycleCompleted,
      detail: input.lifecycleCompleted ? "completed" : "not_completed",
    },
    {
      id: 3,
      name: "verify_country_currency",
      pass: input.currencyPresent,
      detail: input.currencyPresent ? "currency_present" : "currency_missing",
    },
    {
      id: 4,
      name: "verify_authoritative_financial_inputs",
      pass: input.majorsComplete,
      detail: input.majorsComplete ? "majors_complete" : "majors_incomplete",
    },
    {
      id: 5,
      name: "verify_fc01_15_percent_resolves",
      pass: input.fc01RateResolves && isFinancePolicyApproved("FC-01"),
      detail: input.fc01RateResolves
        ? `rate=${requireFc01ApprovedPlatformCommissionRate()}`
        : "fc01_unresolved",
    },
    {
      id: 6,
      name: "verify_discount_treatment",
      pass: input.discountOk,
      detail: input.discountOk ? "fc02_ok" : "discount_blocked",
    },
    {
      id: 7,
      name: "verify_driver_amount_inputs",
      pass: input.driverNetPresent,
      detail: input.driverNetPresent ? "driver_net_present" : "driver_net_missing",
    },
    {
      id: 8,
      name: "verify_agent_attribution",
      pass: input.agentOk,
      detail: input.agentOk ? "agent_ok_or_unknown_historical" : "agent_invalid",
    },
    {
      id: 9,
      name: "verify_no_prior_snapshot_idempotency",
      pass: input.noPriorSnapshot,
      detail: input.noPriorSnapshot ? "no_prior" : "duplicate_risk",
    },
    {
      id: 10,
      name: "verify_reconciliation_preconditions",
      pass: input.reconciliationOk,
      detail: input.reconciliationOk ? "recon_ok" : "recon_blocked",
    },
    {
      id: 11,
      name: "calculate_exact_expected_values",
      pass: input.calculated,
      detail: input.calculated ? "snapshot_calculated" : "not_calculated",
    },
    {
      id: 12,
      name: "calculate_exact_expected_write_counts",
      pass: input.expectedWritesKnown,
      detail: input.expectedWritesKnown ? "writes_known" : "writes_unknown",
    },
    {
      id: 13,
      name: "prove_finance_rbac",
      pass: input.rbacPass,
      detail: input.rbacPass
        ? FINANCE_FR1_REQUIRED_RBAC_PERMISSIONS.join(",")
        : "rbac_fail",
    },
    {
      id: 14,
      name: "prove_non_finance_writes_forbidden",
      pass: input.nonFinanceWritesForbidden,
      detail: input.nonFinanceWritesForbidden
        ? FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS.join(",")
        : "forbidden_writes_not_proven",
    },
  ];
}

export function actorHasFinanceFr1Rbac(permissions: FinancePermission[]): boolean {
  return FINANCE_FR1_REQUIRED_RBAC_PERMISSIONS.every((p) =>
    permissions.includes(p),
  );
}
