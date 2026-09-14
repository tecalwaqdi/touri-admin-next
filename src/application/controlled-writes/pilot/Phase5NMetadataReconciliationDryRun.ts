/**
 * Phase 5N — metadata reconciliation dry-run / plan service.
 * READ-ONLY when live. Never writes. Never re-executes Driver domain command.
 */

import { loadPhase5KFixtureUidFromRegistry } from "@/application/controlled-writes/pilot/Phase5KRegistrySource";
import { isPhase5NMetadataReconcileDryRunEnabled } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import { planPhase5NMetadataReconciliation } from "@/application/controlled-writes/pilot/Phase5NReconciliationPlanner";
import type { Phase5NMetadataReadPort } from "@/application/controlled-writes/pilot/Phase5NReadOnlyMetadataPorts";
import type { Phase5NObservedMetadata } from "@/application/controlled-writes/pilot/Phase5NObservedMetadata";
import {
  emptyPhase5NReconciliationSafeSummary,
  summaryFromPhase5NPlan,
  type Phase5NReconciliationSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5NReconciliationSafeSummary";

export type Phase5NDryRunResult = {
  readonly summary: Phase5NReconciliationSafeSummary;
  readonly observed: Phase5NObservedMetadata | null;
  readonly productionWriteInvoked: false;
  readonly domainCommandInvoked: false;
};

export async function runPhase5NMetadataReconciliationDryRun(input: {
  harnessArmed?: boolean;
  /** Injected observed snapshot (offline unit tests). */
  observed?: Phase5NObservedMetadata;
  /** Live read port — used only when harnessArmed and no observed inject. */
  readPort?: Phase5NMetadataReadPort;
  cwd?: string;
  plannedSuccessAuditId?: string;
  envFlag?: string;
}): Promise<Phase5NDryRunResult> {
  const armed =
    input.harnessArmed === true ||
    isPhase5NMetadataReconcileDryRunEnabled(input.envFlag);

  if (!armed && !input.observed) {
    return {
      summary: emptyPhase5NReconciliationSafeSummary({
        overallStatus: "SKIPPED",
        harnessArmed: false,
        blocker: "PHASE5N_METADATA_RECONCILE_DRY_RUN not armed",
      }),
      observed: null,
      productionWriteInvoked: false,
      domainCommandInvoked: false,
    };
  }

  let observed = input.observed ?? null;
  let productionReads = 0;
  let liveReadAttempted = false;

  if (!observed) {
    const registry = loadPhase5KFixtureUidFromRegistry(input.cwd);
    if (!registry.ok) {
      return {
        summary: emptyPhase5NReconciliationSafeSummary({
          overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
          harnessArmed: true,
          dryRunExecuted: true,
          goNoGo: "NO-GO",
          denials: [registry.code],
          blocker: registry.message,
        }),
        observed: null,
        productionWriteInvoked: false,
        domainCommandInvoked: false,
      };
    }
    if (!input.readPort) {
      return {
        summary: emptyPhase5NReconciliationSafeSummary({
          overallStatus: "PENDING_OPERATOR",
          harnessArmed: true,
          dryRunExecuted: false,
          goNoGo: "NO-GO",
          denials: ["read_port_missing"],
          blocker: "read_port_missing — inject readPort for live dry-run",
        }),
        observed: null,
        productionWriteInvoked: false,
        domainCommandInvoked: false,
      };
    }
    liveReadAttempted = true;
    observed = await input.readPort.loadObservedMetadata({
      driverId: registry.uid,
    });
    // Counter may be on port implementation; leave 0 unless caller sets.
    productionReads = 0;
  }

  const plan = planPhase5NMetadataReconciliation(observed, {
    plannedSuccessAuditId: input.plannedSuccessAuditId,
  });

  const summary = summaryFromPhase5NPlan(plan, {
    harnessArmed: true,
    dryRunExecuted: true,
    liveReadAttempted,
    productionReads,
    authDisabled: observed.auth?.disabled ?? null,
    authClaimsKeys: observed.auth?.claimsKeys ?? [],
    overallStatus:
      plan.decision === "PLAN_METADATA_RECONCILE"
        ? "PHASE5N_METADATA_RECONCILE_DRY_RUN_PASS"
        : plan.overallStatus,
  });

  return {
    summary,
    observed,
    productionWriteInvoked: false,
    domainCommandInvoked: false,
  };
}
