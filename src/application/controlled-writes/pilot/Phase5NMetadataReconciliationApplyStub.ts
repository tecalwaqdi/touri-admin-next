/**
 * Phase 5N — apply stub (NOT armed for live Production reconciliation).
 * Preparation only: documents the apply surface; always refuses execution.
 */

import { isPhase5NMetadataReconcileApplyEnabled } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import type { Phase5NReconciliationPlan } from "@/application/controlled-writes/pilot/Phase5NReconciliationPlanner";
import {
  emptyPhase5NReconciliationSafeSummary,
  type Phase5NReconciliationSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5NReconciliationSafeSummary";
import type { Phase5NMetadataWritePort } from "@/application/controlled-writes/pilot/Phase5NApplyPorts";

export type { Phase5NMetadataWritePort };

/**
 * Apply stub — HARD refuse live writes in this preparation phase.
 * Even if PHASE5N_METADATA_RECONCILE_APPLY=1, this stub does not execute.
 */
export async function runPhase5NMetadataReconciliationApplyStub(input?: {
  plan?: Phase5NReconciliationPlan;
  writePort?: Phase5NMetadataWritePort;
  envFlag?: string;
}): Promise<{
  summary: Phase5NReconciliationSafeSummary;
  productionWriteInvoked: false;
  domainCommandInvoked: false;
  applyRefused: true;
}> {
  const flagOn = isPhase5NMetadataReconcileApplyEnabled(input?.envFlag);
  return {
    summary: emptyPhase5NReconciliationSafeSummary({
      overallStatus: "PHASE5N_METADATA_RECONCILE_APPLY_STUB",
      harnessArmed: flagOn,
      applyAttempted: false,
      productionWrites: 0,
      actualMetadataWrites: 0,
      goNoGo: "NO-GO",
      decision: "APPLY_STUB_REFUSED",
      denials: ["live_apply_not_armed_in_phase5n_preparation"],
      blocker:
        "Phase 5N preparation only — live metadata reconciliation apply is stubbed/refused",
      driverDomainWriteRequired: false,
      authClaimsRepairRequired: false,
      forbiddenDomainWrites: 0,
      ...(input?.plan
        ? {
            exactExpectedWriteCounts: input.plan.exactExpectedWriteCounts,
            exactPlannedMetadataDiff: input.plan.exactPlannedMetadataDiff,
            driverState: input.plan.driverState,
            originalOperationIdentified: input.plan.originalOperationIdentified,
            auditIntentStatus: input.plan.auditIntentStatus,
            auditResultStatus: input.plan.auditResultStatus,
            idempotencyStatus: input.plan.idempotencyStatus,
            metadataInconsistencies: input.plan.metadataInconsistencies,
            conflictingMetadataDetected:
              input.plan.conflictingMetadataDetected,
          }
        : {}),
    }),
    productionWriteInvoked: false,
    domainCommandInvoked: false,
    applyRefused: true,
  };
}
