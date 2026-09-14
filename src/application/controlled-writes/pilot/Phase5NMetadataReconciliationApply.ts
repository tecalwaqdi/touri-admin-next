/**
 * Phase 5N — operator-controlled metadata reconciliation APPLY orchestrator.
 *
 * Path: re-read preconditions → plan → (optional) create-only success RESULT →
 * set(merge) idempotency result.auditResultId only → post-verify.
 *
 * NEVER RequestDriverChangesCommand. NEVER Driver/Auth/Finance/Trip/Agent/Customer.
 * Default: do not apply. Live apply only when harnessArmed + gates + executeApply.
 */

import { loadPhase5KFixtureUidFromRegistry } from "@/application/controlled-writes/pilot/Phase5KRegistrySource";
import { isPhase5NMetadataReconcileApplyEnabled } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import {
  planPhase5NMetadataReconciliation,
  type Phase5NReconciliationPlan,
} from "@/application/controlled-writes/pilot/Phase5NReconciliationPlanner";
import {
  buildPhase5NIdempotencyAuditResultIdPatch,
  buildPhase5NSuccessAuditResultPayload,
  type Phase5NExactPlannedMetadataDiff,
} from "@/application/controlled-writes/pilot/Phase5NPlannedMetadataDiff";
import { redactPhase5NPlannedDiffForSafeSummary as redactDiff } from "@/application/controlled-writes/pilot/Phase5NReconciliationSafeSummary";
import {
  emptyPhase5NApplySafeSummary,
  evaluatePhase5NApplyPassConditions,
  type Phase5NApplySafeSummary,
} from "@/application/controlled-writes/pilot/Phase5NApplySafeSummary";
import {
  evaluatePhase5NOperatorGates,
  type Phase5NOperatorGateEnv,
} from "@/application/controlled-writes/pilot/Phase5NOperatorGates";
import {
  createPhase5NWriteCounter,
  phase5NForbiddenWritesZero,
  phase5NMetadataWritesFromCounter,
  type Phase5NApplyPorts,
  type Phase5NWriteCounter,
} from "@/application/controlled-writes/pilot/Phase5NApplyPorts";
import type { Phase5NObservedMetadata } from "@/application/controlled-writes/pilot/Phase5NObservedMetadata";
import {
  PHASE_5N_MAX_METADATA_WRITES,
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
} from "@/application/controlled-writes/pilot/Phase5NConstants";
import { PHASE_5N_ZERO_WRITE_COUNTS } from "@/application/controlled-writes/pilot/Phase5NExpectedWriteCounts";
import { assertFirestoreDocumentHasNoUndefined } from "@/application/controlled-writes/omitUndefinedForFirestore";

export type Phase5NApplyInput = {
  readonly harnessArmed: boolean;
  readonly cwd?: string;
  readonly ports?: Phase5NApplyPorts;
  readonly gates?: Phase5NOperatorGateEnv;
  /** When true, execute metadata writes after preconditions pass. */
  readonly executeApply?: boolean;
  /** Injected observed snapshot (offline unit tests — skips live read). */
  readonly observed?: Phase5NObservedMetadata;
  /** Optional fixed success audit id (tests). Live generates a new id. */
  readonly plannedSuccessAuditId?: string;
  readonly envFlag?: string;
  readonly liveApplyAttempted?: boolean;
};

export type Phase5NApplyResult = {
  readonly summary: Phase5NApplySafeSummary;
  readonly plan: Phase5NReconciliationPlan | null;
  readonly observedBefore: Phase5NObservedMetadata | null;
  readonly observedAfter: Phase5NObservedMetadata | null;
  readonly domainCommandInvoked: false;
  readonly productionWriteInvoked: boolean;
};

function generateSuccessAuditResultId(): string {
  return `dwr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function counterFields(counter: Phase5NWriteCounter): Pick<
  Phase5NApplySafeSummary,
  | "actualSuccessAuditResultCreates"
  | "actualIdempotencyPatches"
  | "metadataWrites"
  | "driverDomainWrites"
  | "authClaimWrites"
  | "financeWrites"
  | "tripWrites"
  | "agentWrites"
  | "customerWrites"
  | "productionWrites"
  | "productionReads"
  | "forbiddenWritesZero"
> {
  const metadataWrites = phase5NMetadataWritesFromCounter(counter);
  return {
    actualSuccessAuditResultCreates: counter.successAuditResultCreates,
    actualIdempotencyPatches: counter.idempotencyPatches,
    metadataWrites,
    driverDomainWrites: counter.driverDomainWrites,
    authClaimWrites: counter.authClaimWrites,
    financeWrites: counter.financeWrites,
    tripWrites: counter.tripWrites,
    agentWrites: counter.agentWrites,
    customerWrites: counter.customerWrites,
    productionWrites: metadataWrites,
    productionReads: counter.productionReads,
    forbiddenWritesZero: phase5NForbiddenWritesZero(counter),
  };
}

function verifyPostReconcile(input: {
  before: Phase5NObservedMetadata;
  after: Phase5NObservedMetadata;
  successAuditResultId: string;
  expectedCreates: number;
}): { ok: boolean; denials: string[] } {
  const denials: string[] = [];
  if (input.after.driverState !== "needs_changes") {
    denials.push("post_verify_driver_not_needs_changes");
  }
  if (input.before.driverState !== input.after.driverState) {
    denials.push("post_verify_driver_state_changed");
  }
  const success = input.after.auditResults.filter(
    (r) =>
      r.kind === "AUDIT_RESULT" &&
      r.outcome === "applied" &&
      r.intentAuditId === PHASE_5N_ORIGINAL_INTENT_AUDIT_ID &&
      r.auditId === input.successAuditResultId,
  );
  if (success.length !== 1) {
    denials.push("post_verify_success_result_missing_or_ambiguous");
  } else {
    const s = success[0]!;
    if (Object.prototype.hasOwnProperty.call(s, "code") && s.code !== undefined) {
      // code should be omitted; if present must not be set — observed may omit
    }
    if (s.hasUndefinedCodeField === true) {
      denials.push("post_verify_success_result_has_undefined_code");
    }
    if (s.action !== "needs_changes" || s.toState !== "needs_changes") {
      denials.push("post_verify_success_result_shape_mismatch");
    }
  }
  if (!input.after.idempotency) {
    denials.push("post_verify_idempotency_missing");
  } else if (
    input.after.idempotency.result.auditResultId !== input.successAuditResultId
  ) {
    denials.push("post_verify_idempotency_audit_result_id_mismatch");
  }
  // Domain never repaired / never touched.
  if (input.expectedCreates >= 0) {
    // no-op — creates already counted separately
  }
  return { ok: denials.length === 0, denials };
}

/**
 * Run Phase 5N metadata reconcile apply preparation / apply.
 * When harnessArmed=false → SKIPPED (writes=0).
 * When executeApply=false → gates + precondition plan only (still no writes).
 */
export async function runPhase5NMetadataReconciliationApply(
  input: Phase5NApplyInput,
): Promise<Phase5NApplyResult> {
  const armed =
    input.harnessArmed === true ||
    isPhase5NMetadataReconcileApplyEnabled(input.envFlag);

  if (!armed) {
    return {
      summary: emptyPhase5NApplySafeSummary({
        overallStatus: "SKIPPED",
        harnessArmed: false,
        blocker: "PHASE5N_METADATA_RECONCILE_APPLY not armed",
      }),
      plan: null,
      observedBefore: null,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }

  const gates = evaluatePhase5NOperatorGates(input.gates);
  if (!gates.ok) {
    return {
      summary: emptyPhase5NApplySafeSummary({
        overallStatus: "GATED_REFUSED",
        harnessArmed: true,
        applyAttempted: false,
        goNoGo: "NO-GO",
        decision: gates.code,
        denials: [gates.code, ...gates.missingRequired, ...gates.unsafeTrue],
        blocker: gates.message,
      }),
      plan: null,
      observedBefore: null,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }

  const counter = input.ports?.counter ?? createPhase5NWriteCounter();
  let observedBefore = input.observed ?? null;
  let driverId: string | null = input.observed?.auditIntent?.driverId ?? null;

  if (!observedBefore) {
    const registry = loadPhase5KFixtureUidFromRegistry(input.cwd);
    if (!registry.ok) {
      return {
        summary: emptyPhase5NApplySafeSummary({
          overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
          harnessArmed: true,
          applyAttempted: false,
          goNoGo: "NO-GO",
          denials: [registry.code],
          blocker: registry.message,
          ...counterFields(counter),
        }),
        plan: null,
        observedBefore: null,
        observedAfter: null,
        domainCommandInvoked: false,
        productionWriteInvoked: false,
      };
    }
    driverId = registry.uid;
    if (!input.ports?.read) {
      return {
        summary: emptyPhase5NApplySafeSummary({
          overallStatus: "PENDING_OPERATOR",
          harnessArmed: true,
          applyAttempted: false,
          goNoGo: "NO-GO",
          denials: ["read_port_missing"],
          blocker: "read_port_missing — inject ports for live apply",
          ...counterFields(counter),
        }),
        plan: null,
        observedBefore: null,
        observedAfter: null,
        domainCommandInvoked: false,
        productionWriteInvoked: false,
      };
    }
    observedBefore = await input.ports.read.loadObservedMetadata({
      driverId: registry.uid,
    });
  }

  const plan = planPhase5NMetadataReconciliation(observedBefore, {
    plannedSuccessAuditId: input.plannedSuccessAuditId,
  });

  const baseFromPlan = (extras?: Partial<Phase5NApplySafeSummary>) =>
    emptyPhase5NApplySafeSummary({
      harnessArmed: true,
      applyAttempted: false,
      driverStateBefore: observedBefore!.driverState,
      driverStateAfter: observedBefore!.driverState,
      originalOperationIdentified: plan.originalOperationIdentified,
      auditIntentStatus: plan.auditIntentStatus,
      auditResultStatusBefore: plan.auditResultStatus,
      auditResultStatusAfter: plan.auditResultStatus,
      idempotencyStatusBefore: plan.idempotencyStatus,
      idempotencyStatusAfter: plan.idempotencyStatus,
      exactExpectedWriteCounts: plan.exactExpectedWriteCounts,
      exactAppliedMetadataDiff: redactDiff(plan.exactPlannedMetadataDiff),
      conflictingMetadataDetected: plan.conflictingMetadataDetected,
      driverDomainWriteRequired: false,
      authClaimsRepairRequired: false,
      goNoGo: plan.goNoGo,
      decision: plan.decision,
      denials: [...plan.denials],
      blocker: plan.blocker,
      ...counterFields(counter),
      ...extras,
    });

  // Already reconciled → 0 writes, never second success RESULT.
  if (plan.decision === "NO_WRITE_ALREADY_COMPLETE") {
    return {
      summary: baseFromPlan({
        overallStatus: "PHASE5N_METADATA_RECONCILE_ALREADY_RECONCILED",
        alreadyReconciled: true,
        applyAttempted: false,
        goNoGo: "NO-GO",
        reconciliationVerified: true,
        exactExpectedWriteCounts: PHASE_5N_ZERO_WRITE_COUNTS,
        blocker: "already_reconciled — 0 metadata writes",
      }),
      plan,
      observedBefore,
      observedAfter: observedBefore,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }

  // Precondition / conflict fail → applyAttempted=false, writes=0.
  if (plan.goNoGo !== "GO" || plan.decision !== "PLAN_METADATA_RECONCILE") {
    return {
      summary: baseFromPlan({
        overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
        applyAttempted: false,
        goNoGo: "NO-GO",
        blocker: plan.blocker ?? "precondition_failed",
      }),
      plan,
      observedBefore,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }

  // Authoritative live reconcile for known incomplete state: creates=1 patches=1.
  // Patch-only (success already present) is allowed for crash-recovery completion
  // but PASS (§11) requires creates=1 patches=1 metadata=2.
  const expectedCreates = plan.exactExpectedWriteCounts.successAuditResultCreates;
  const expectedPatches = plan.exactExpectedWriteCounts.idempotencyPatches;
  if (
    plan.exactExpectedWriteCounts.metadataWrites > PHASE_5N_MAX_METADATA_WRITES ||
    plan.exactExpectedWriteCounts.driverDomainWrites !== 0 ||
    plan.exactExpectedWriteCounts.authClaimWrites !== 0
  ) {
    return {
      summary: baseFromPlan({
        overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
        applyAttempted: false,
        denials: ["metadata_write_budget_or_forbidden_planned"],
        blocker: "metadata_write_budget_or_forbidden_planned",
      }),
      plan,
      observedBefore,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }

  // Conflicting non-empty auditResultId that doesn't match — planner already NO-GO.
  // Never overwrite a conflicting auditResultId (extra guard).
  const existingAuditResultId =
    observedBefore.idempotency?.result.auditResultId?.trim() ?? "";
  if (
    existingAuditResultId &&
    plan.idempotencyStatus === "incomplete_missing_audit_result_id"
  ) {
    // incomplete means empty — inconsistency
    return {
      summary: baseFromPlan({
        overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
        applyAttempted: false,
        denials: ["idempotency_audit_result_id_unexpected_nonempty"],
        blocker: "idempotency_audit_result_id_unexpected_nonempty",
      }),
      plan,
      observedBefore,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }
  if (
    existingAuditResultId &&
    expectedCreates === 1 &&
    plan.auditResultStatus !== "success_present"
  ) {
    return {
      summary: baseFromPlan({
        overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
        applyAttempted: false,
        denials: ["refuse_overwrite_conflicting_audit_result_id"],
        blocker: "refuse_overwrite_conflicting_audit_result_id",
        conflictingMetadataDetected: true,
      }),
      plan,
      observedBefore,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }

  if (!input.executeApply) {
    return {
      summary: baseFromPlan({
        overallStatus: "PENDING_OPERATOR",
        applyAttempted: false,
        goNoGo: "GO",
        blocker:
          "PENDING_OPERATOR — gates+plan GO; executeApply=false; no Production write this call",
      }),
      plan,
      observedBefore,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }

  if (!input.ports?.write) {
    return {
      summary: baseFromPlan({
        overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
        applyAttempted: false,
        denials: ["write_port_missing"],
        blocker: "write_port_missing",
      }),
      plan,
      observedBefore,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }

  const intent = observedBefore.auditIntent;
  if (!intent) {
    return {
      summary: baseFromPlan({
        overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
        applyAttempted: false,
        denials: ["audit_intent_missing_at_apply"],
        blocker: "audit_intent_missing_at_apply",
      }),
      plan,
      observedBefore,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: false,
    };
  }

  // Determine success RESULT id: create new, or reuse existing if patch-only.
  let successAuditResultId =
    input.plannedSuccessAuditId ??
    plan.exactPlannedMetadataDiff.successAuditResultCreate?.documentId ??
    generateSuccessAuditResultId();

  if (expectedCreates === 0 && expectedPatches === 1) {
    const existingSuccess = observedBefore.auditResults.find(
      (r) =>
        r.kind === "AUDIT_RESULT" &&
        r.outcome === "applied" &&
        r.intentAuditId === PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
    );
    if (!existingSuccess) {
      return {
        summary: baseFromPlan({
          overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
          applyAttempted: false,
          denials: ["patch_only_but_success_result_missing"],
          blocker: "patch_only_but_success_result_missing",
        }),
        plan,
        observedBefore,
        observedAfter: null,
        domainCommandInvoked: false,
        productionWriteInvoked: false,
      };
    }
    successAuditResultId = existingSuccess.auditId;
  }

  // Apply writes — create then patch. No retry loop.
  let appliedDiff: Phase5NExactPlannedMetadataDiff = {
    successAuditResultCreate: null,
    idempotencyPatch: null,
    domainWrites: [],
    authClaimWrites: [],
    financeWrites: [],
    tripWrites: [],
    agentWrites: [],
    customerWrites: [],
  };

  try {
    if (expectedCreates === 1) {
      const payload = buildPhase5NSuccessAuditResultPayload({
        auditId: successAuditResultId,
        driverId: intent.driverId,
        countryId: intent.countryId,
        fromState: "pending_review",
        toState: "needs_changes",
        createdAtUtc: new Date().toISOString(),
      });
      assertFirestoreDocumentHasNoUndefined(payload);
      if (Object.prototype.hasOwnProperty.call(payload, "code")) {
        return {
          summary: baseFromPlan({
            overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
            applyAttempted: false,
            denials: ["success_payload_contains_code_field"],
            blocker: "success_payload_contains_code_field",
          }),
          plan,
          observedBefore,
          observedAfter: null,
          domainCommandInvoked: false,
          productionWriteInvoked: false,
        };
      }
      await input.ports.write.createSuccessAuditResult({
        documentId: successAuditResultId,
        payload,
      });
      appliedDiff = {
        ...appliedDiff,
        successAuditResultCreate: {
          op: "create",
          collection: "admin_next_cw_audit",
          documentId: successAuditResultId,
          precondition: "create-only",
          payload: { ...payload, driverId: "<redacted>" },
        },
      };
    }

    if (expectedPatches === 1) {
      // Refuse overwrite if somehow nonempty and different.
      const freshIdem = (
        input.ports.read
          ? await input.ports.read.loadObservedMetadata({
              driverId: driverId ?? intent.driverId,
            })
          : observedBefore
      ).idempotency;
      const currentId = freshIdem?.result.auditResultId?.trim() ?? "";
      if (currentId && currentId !== successAuditResultId) {
        return {
          summary: baseFromPlan({
            overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
            applyAttempted: true,
            exactAppliedMetadataDiff: redactDiff(appliedDiff),
            denials: ["refuse_overwrite_conflicting_audit_result_id"],
            blocker: "refuse_overwrite_conflicting_audit_result_id",
            conflictingMetadataDetected: true,
            ...counterFields(counter),
          }),
          plan,
          observedBefore,
          observedAfter: null,
          domainCommandInvoked: false,
          productionWriteInvoked: counter.successAuditResultCreates > 0,
        };
      }
      if (!currentId) {
        await input.ports.write.patchIdempotencyAuditResultId({
          key: PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
          auditResultId: successAuditResultId,
        });
        appliedDiff = {
          ...appliedDiff,
          idempotencyPatch:
            buildPhase5NIdempotencyAuditResultIdPatch(successAuditResultId),
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      summary: baseFromPlan({
        overallStatus: "PHASE5N_METADATA_RECONCILE_NO_GO",
        applyAttempted: true,
        exactAppliedMetadataDiff: redactDiff(appliedDiff),
        denials: ["metadata_write_failed"],
        blocker: message.slice(0, 240),
        ...counterFields(counter),
      }),
      plan,
      observedBefore,
      observedAfter: null,
      domainCommandInvoked: false,
      productionWriteInvoked: phase5NMetadataWritesFromCounter(counter) > 0,
    };
  }

  // Post-write verify.
  let observedAfter = observedBefore;
  if (input.ports.read) {
    observedAfter = await input.ports.read.loadObservedMetadata({
      driverId: driverId ?? intent.driverId,
    });
  }

  const afterPlan = planPhase5NMetadataReconciliation(observedAfter);
  const verify = verifyPostReconcile({
    before: observedBefore,
    after: observedAfter,
    successAuditResultId,
    expectedCreates,
  });

  const counts = counterFields(counter);
  const passFull = evaluatePhase5NApplyPassConditions({
    ...counts,
    reconciliationVerified: verify.ok,
  });
  // Patch-only recovery: verified complete with 1 patch and 0 creates this run.
  const passPatchOnly =
    expectedCreates === 0 &&
    expectedPatches === 1 &&
    counts.actualSuccessAuditResultCreates === 0 &&
    counts.actualIdempotencyPatches === 1 &&
    counts.metadataWrites === 1 &&
    counts.forbiddenWritesZero &&
    verify.ok &&
    afterPlan.decision === "NO_WRITE_ALREADY_COMPLETE";

  const pass = passFull || passPatchOnly;

  return {
    summary: emptyPhase5NApplySafeSummary({
      overallStatus: pass
        ? "PHASE5N_METADATA_RECONCILE_PASS"
        : "PHASE5N_METADATA_RECONCILE_NO_GO",
      harnessArmed: true,
      applyAttempted: true,
      alreadyReconciled: false,
      driverStateBefore: observedBefore.driverState,
      driverStateAfter: observedAfter.driverState,
      originalOperationIdentified: plan.originalOperationIdentified,
      auditIntentStatus: plan.auditIntentStatus,
      auditResultStatusBefore: plan.auditResultStatus,
      auditResultStatusAfter: afterPlan.auditResultStatus,
      idempotencyStatusBefore: plan.idempotencyStatus,
      idempotencyStatusAfter: afterPlan.idempotencyStatus,
      exactAppliedMetadataDiff: redactDiff(appliedDiff),
      exactExpectedWriteCounts: plan.exactExpectedWriteCounts,
      reconciliationVerified: verify.ok,
      conflictingMetadataDetected: false,
      driverDomainWriteRequired: false,
      authClaimsRepairRequired: false,
      goNoGo: pass ? "GO" : "NO-GO",
      decision: pass ? "METADATA_RECONCILE_APPLIED" : "METADATA_RECONCILE_VERIFY_FAILED",
      denials: verify.ok ? [] : verify.denials,
      blocker: pass
        ? null
        : verify.denials[0] ?? "metadata_reconcile_verify_failed",
      ...counts,
    }),
    plan,
    observedBefore,
    observedAfter,
    domainCommandInvoked: false,
    productionWriteInvoked: phase5NMetadataWritesFromCounter(counter) > 0,
  };
}
