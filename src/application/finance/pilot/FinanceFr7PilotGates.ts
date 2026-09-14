/**
 * FR7 Reporting pilot gates — read-only live verify.
 * All write flags must remain false. No reporting table writes.
 */

import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  FINANCE_FR7_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR7_EXPECTED_PROJECT_ID,
  FINANCE_FR7_PERSISTENCE_MODE,
  FINANCE_FR7_REPORTING_PILOT_VERIFY_ENV,
  FINANCE_FR7_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr7PilotConstants";

export type FinanceFr7PrepChecklistItem = {
  id: number;
  name: string;
  pass: boolean;
  detail: string;
};

export type FinanceFr7OperatorGateEnv = {
  readonly FINANCE_FR7_REPORTING_PILOT_VERIFY?: string | undefined;
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
  readonly FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY?: string | undefined;
  readonly FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY?: string | undefined;
  readonly FINANCE_FR6_ADJUSTMENT_PILOT_APPLY?: string | undefined;
  readonly [key: string]: string | undefined;
};

export const FINANCE_FR7_REQUIRED_RBAC_PERMISSIONS: readonly FinancePermission[] =
  ["finance:read"];

export function isFinanceFr7ReportingPilotVerifyEnabled(
  value?: string | undefined | null,
): boolean {
  return String(value ?? "").trim() === "1";
}

export function assertFinanceFr7PrepWriteDisabled(
  env: FinanceFr7OperatorGateEnv = process.env,
): void {
  if (env.FINANCE_WRITE_ENABLED === "true") {
    throw new Error(
      "FINANCE_WRITE_ENABLED must remain false during FR7 Reporting pilot preparation",
    );
  }
  if (FINANCE_WRITE_ENABLED_DEFAULT !== false) {
    throw new Error("FINANCE_WRITE_ENABLED_DEFAULT must be false");
  }
}

export function evaluateFinanceFr7LiveVerifyGates(input: {
  env: FinanceFr7OperatorGateEnv;
  mode: "preparation" | "live_verify";
}): {
  armed: boolean;
  allowed: boolean;
  blockers: string[];
  persistenceMode: typeof FINANCE_FR7_PERSISTENCE_MODE;
  projectId: typeof FINANCE_FR7_EXPECTED_PROJECT_ID | null;
  expectedAdcPrincipal: typeof FINANCE_FR7_EXPECTED_ADC_PRINCIPAL;
  expectedWrites: typeof FINANCE_FR7_ZERO_WRITE_COUNTS;
} {
  const blockers: string[] = [];
  const armed = isFinanceFr7ReportingPilotVerifyEnabled(
    input.env[FINANCE_FR7_REPORTING_PILOT_VERIFY_ENV],
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
      persistenceMode: FINANCE_FR7_PERSISTENCE_MODE,
      projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
      expectedAdcPrincipal: FINANCE_FR7_EXPECTED_ADC_PRINCIPAL,
      expectedWrites: FINANCE_FR7_ZERO_WRITE_COUNTS,
    };
  }

  if (!armed) blockers.push("FINANCE_FR7_REPORTING_PILOT_VERIFY!=1");
  if (input.env.FINANCE_WRITE_ENABLED === "true") {
    blockers.push("FINANCE_WRITE_ENABLED_must_be_false_for_read_only_fr7");
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
  if (input.env.FINANCE_FR1_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR1_PILOT_APPLY_must_not_be_armed");
  }
  if (input.env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR2_SETTLEMENT_PILOT_APPLY_must_not_be_armed");
  }
  if (input.env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY === "1") {
    blockers.push(
      "FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY_must_not_be_armed",
    );
  }
  if (input.env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY === "1") {
    blockers.push(
      "FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY_must_not_be_armed",
    );
  }
  if (input.env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY === "1") {
    blockers.push("FINANCE_FR6_ADJUSTMENT_PILOT_APPLY_must_not_be_armed");
  }

  const project =
    input.env.EXPECTED_PROJECT_ID?.trim() ||
    input.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    "";
  if (project !== FINANCE_FR7_EXPECTED_PROJECT_ID) {
    blockers.push("EXPECTED_PROJECT_ID_mismatch");
  }
  if (input.env.SOURCE && input.env.SOURCE !== "fr1_fr6_read_only") {
    blockers.push("SOURCE_must_be_fr1_fr6_read_only");
  }

  return {
    armed,
    allowed: blockers.length === 0,
    blockers,
    persistenceMode: FINANCE_FR7_PERSISTENCE_MODE,
    projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
    expectedAdcPrincipal: FINANCE_FR7_EXPECTED_ADC_PRINCIPAL,
    expectedWrites: FINANCE_FR7_ZERO_WRITE_COUNTS,
  };
}

export function actorHasFinanceFr7ReadRbac(
  permissions: readonly FinancePermission[],
): boolean {
  return permissions.includes("finance:read");
}
