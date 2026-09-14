/**
 * Phase 5H pivot — existing approved synthetic Driver qualification dry-run.
 * Plan / Auth / diff only. actualWrite=false. Never suspend. Never rollback.
 * Never invoke ProductionDriverWriteRepository.apply().
 */

import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  ProductionDriverWriteRepository,
} from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { PHASE_5E_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";
import {
  qualifyExistingApprovedSyntheticDriver,
  type Phase5HExistingApprovedQualificationResult,
} from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverQualification";
import {
  planRollbackTransaction,
  planSuspendTransaction,
} from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverDiffContract";
import { isPhase5HExistingApprovedDriverDryRunEnabled } from "@/application/controlled-writes/pilot/isPhase5HExistingApprovedDriverDryRunEnabled";

export type Phase5HExistingApprovedWriteFlagSnapshot = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  AGENT_WRITE_ENABLED: boolean;
  CUSTOMER_WRITE_ENABLED: boolean;
  CUSTOMER_AUTH_WRITE_ENABLED: boolean;
  FINANCE_WRITE_ENABLED: boolean;
};

export const PHASE_5H_EXISTING_APPROVED_WRITE_FLAGS_FALSE: Phase5HExistingApprovedWriteFlagSnapshot =
  {
    GLOBAL_PRODUCTION_WRITE_ENABLED: false,
    PRODUCTION_WRITE_ENABLED: false,
    DRIVER_WRITE_ENABLED: false,
    AGENT_WRITE_ENABLED: false,
    CUSTOMER_WRITE_ENABLED: false,
    CUSTOMER_AUTH_WRITE_ENABLED: false,
    FINANCE_WRITE_ENABLED: false,
  };

export type Phase5HExistingApprovedDryRunResult = {
  mode: "dry_run";
  envEnabled: boolean;
  wouldWrite: false;
  actualWrite: false;
  productionApplyInvocationCount: 0;
  writeFlagsRemainFalse: true;
  projectId: string;
  qualification: Phase5HExistingApprovedQualificationResult;
  suspendPlanPatch: { registration_status: "suspended" };
  rollbackPlanPatch: { registration_status: "approved" };
  productionRepoReachable: false;
  productionWrites: 0;
  authWrites: 0;
  financeWrites: 0;
  tripWrites: 0;
  dryRunReadiness:
    | "READY_OFFLINE_NO_GO"
    | "SKIP"
    | "READY_OPERATOR_LIVE_READ_ONLY";
};

/**
 * Operator dry-run planner. Always actualWrite=false.
 * Auth evidence alone yields wouldWrite=false / NO_GO.
 */
export function runPhase5HExistingApprovedDriverDryRun(input?: {
  projectId?: string;
  documentId?: string | null;
  data?: Record<string, unknown> | null;
  envFlag?: string;
  writeFlags?: Phase5HExistingApprovedWriteFlagSnapshot;
}): Phase5HExistingApprovedDryRunResult {
  const envFlag =
    input?.envFlag ??
    process.env.PHASE5H_EXISTING_APPROVED_DRIVER_DRY_RUN;
  const envEnabled = isPhase5HExistingApprovedDriverDryRunEnabled(envFlag);
  const projectId =
    input?.projectId?.trim() || PHASE_5E_EXPECTED_PROJECT_ID;
  const flags = input?.writeFlags ?? PHASE_5H_EXISTING_APPROVED_WRITE_FLAGS_FALSE;

  const qualification = qualifyExistingApprovedSyntheticDriver({
    documentId: input?.documentId ?? null,
    data: input?.data,
    offlineContractOnly: !input?.documentId?.trim(),
  });

  // Structural plans only — never apply.
  const placeholderId =
    typeof qualification.safeTargetId === "string" &&
    qualification.safeTargetId !== "PENDING_OPERATOR"
      ? qualification.safeTargetId
      : "PENDING_OPERATOR_PLACEHOLDER";
  const suspendPlan = planSuspendTransaction({
    driverId: placeholderId,
    preconditionToken: "tok_not_exposed",
  });
  const rollbackPlan = planRollbackTransaction({
    driverId: placeholderId,
    preconditionToken: "tok_not_exposed",
  });

  const productionRepoReachable = ProductionDriverWriteRepository.isReachable({
    GLOBAL_PRODUCTION_WRITE_ENABLED: flags.GLOBAL_PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: flags.DRIVER_WRITE_ENABLED,
  });
  if (productionRepoReachable) {
    throw new Error("ProductionDriverWriteRepository must remain unreachable");
  }

  void CONTROLLED_WRITES_ENABLEMENT;
  void suspendPlan;
  void rollbackPlan;

  return {
    mode: "dry_run",
    envEnabled,
    wouldWrite: false,
    actualWrite: false,
    productionApplyInvocationCount: 0,
    writeFlagsRemainFalse: true,
    projectId,
    qualification,
    suspendPlanPatch: { registration_status: "suspended" },
    rollbackPlanPatch: { registration_status: "approved" },
    productionRepoReachable: false,
    productionWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    dryRunReadiness: !envEnabled
      ? "SKIP"
      : qualification.safeTargetId === "PENDING_OPERATOR"
        ? "READY_OFFLINE_NO_GO"
        : "READY_OPERATOR_LIVE_READ_ONLY",
  };
}

export function assertPhase5HExistingApprovedWriteFlagsFalse(
  flags: Phase5HExistingApprovedWriteFlagSnapshot = PHASE_5H_EXISTING_APPROVED_WRITE_FLAGS_FALSE,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === false &&
    flags.PRODUCTION_WRITE_ENABLED === false &&
    flags.DRIVER_WRITE_ENABLED === false &&
    flags.AGENT_WRITE_ENABLED === false &&
    flags.CUSTOMER_WRITE_ENABLED === false &&
    flags.CUSTOMER_AUTH_WRITE_ENABLED === false &&
    flags.FINANCE_WRITE_ENABLED === false
  );
}
