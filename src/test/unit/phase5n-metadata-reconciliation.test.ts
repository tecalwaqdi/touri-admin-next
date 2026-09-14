/**
 * Phase 5N — offline unit tests for metadata reconciliation planner.
 * No Production writes. No RequestDriverChangesCommand.
 */

import { describe, expect, it } from "vitest";
import { assertFirestoreDocumentHasNoUndefined } from "@/application/controlled-writes/omitUndefinedForFirestore";
import { planPhase5NMetadataReconciliation } from "@/application/controlled-writes/pilot/Phase5NReconciliationPlanner";
import { runPhase5NMetadataReconciliationDryRun } from "@/application/controlled-writes/pilot/Phase5NMetadataReconciliationDryRun";
import { runPhase5NMetadataReconciliationApplyStub } from "@/application/controlled-writes/pilot/Phase5NMetadataReconciliationApplyStub";
import {
  phase5NFixtureAlreadyComplete,
  phase5NFixtureConflictDriverNotNeedsChanges,
  phase5NFixtureConflictWrongIdempotencyStatus,
  phase5NFixtureProductionIncomplete,
  phase5NFixtureSuccessPresentIdempotencyIncomplete,
} from "@/application/controlled-writes/pilot/Phase5NFixtures";
import { buildPhase5NSuccessAuditResultPayload } from "@/application/controlled-writes/pilot/Phase5NPlannedMetadataDiff";
import { isPhase5NMetadataReconcileDryRunEnabled } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import { PHASE_5N_MAX_METADATA_WRITES } from "@/application/controlled-writes/pilot/Phase5NConstants";

describe("Phase 5N — metadata reconciliation planner (offline)", () => {
  it("defaults dry-run gate to SKIP", () => {
    expect(isPhase5NMetadataReconcileDryRunEnabled(undefined)).toBe(false);
    expect(isPhase5NMetadataReconcileDryRunEnabled("")).toBe(false);
    expect(isPhase5NMetadataReconcileDryRunEnabled("true")).toBe(false);
    expect(isPhase5NMetadataReconcileDryRunEnabled("1")).toBe(true);
  });

  it("already-complete → NO WRITE", () => {
    const plan = planPhase5NMetadataReconciliation(
      phase5NFixtureAlreadyComplete(),
    );
    expect(plan.decision).toBe("NO_WRITE_ALREADY_COMPLETE");
    expect(plan.goNoGo).toBe("NO-GO");
    expect(plan.exactExpectedWriteCounts.metadataWrites).toBe(0);
    expect(plan.exactPlannedMetadataDiff.successAuditResultCreate).toBeNull();
    expect(plan.exactPlannedMetadataDiff.idempotencyPatch).toBeNull();
    expect(plan.driverDomainWriteRequired).toBe(false);
    expect(plan.forbiddenDomainWrites).toBe(0);
    expect(plan.authClaimsRepairRequired).toBe(false);
  });

  it("missing success RESULT (+ known failure residue) → plan create + idempotency patch", () => {
    const plan = planPhase5NMetadataReconciliation(
      phase5NFixtureProductionIncomplete(),
      { plannedSuccessAuditId: "dwr_phase5n_planned" },
    );
    expect(plan.decision).toBe("PLAN_METADATA_RECONCILE");
    expect(plan.goNoGo).toBe("GO");
    expect(plan.driverState).toBe("needs_changes");
    expect(plan.driverDomainWriteRequired).toBe(false);
    expect(plan.originalOperationIdentified).toBe(true);
    expect(plan.auditIntentStatus).toBe("present_ok");
    expect(plan.auditResultStatus).toBe("missing_success_failure_residue_ok");
    expect(plan.idempotencyStatus).toBe("incomplete_missing_audit_result_id");
    expect(plan.exactExpectedWriteCounts).toEqual({
      driverDomainWrites: 0,
      auditIntentWrites: 0,
      successAuditResultCreates: 1,
      idempotencyPatches: 1,
      authClaimWrites: 0,
      financeWrites: 0,
      tripWrites: 0,
      agentWrites: 0,
      customerWrites: 0,
      metadataWrites: 2,
    });
    expect(plan.exactExpectedWriteCounts.metadataWrites).toBeLessThanOrEqual(
      PHASE_5N_MAX_METADATA_WRITES,
    );
    expect(plan.exactPlannedMetadataDiff.domainWrites).toEqual([]);
    expect(plan.exactPlannedMetadataDiff.successAuditResultCreate?.op).toBe(
      "create",
    );
    expect(
      plan.exactPlannedMetadataDiff.successAuditResultCreate?.precondition,
    ).toBe("create-only");
    expect(
      plan.exactPlannedMetadataDiff.idempotencyPatch?.patch.result.auditResultId,
    ).toBe("dwr_phase5n_planned");
    const payload =
      plan.exactPlannedMetadataDiff.successAuditResultCreate!.payload;
    expect(Object.prototype.hasOwnProperty.call(payload, "code")).toBe(false);
    expect(() =>
      assertFirestoreDocumentHasNoUndefined(payload),
    ).not.toThrow();
  });

  it("incomplete idempotency (success present) → min patch only", () => {
    const plan = planPhase5NMetadataReconciliation(
      phase5NFixtureSuccessPresentIdempotencyIncomplete("dwr_success_present"),
    );
    expect(plan.decision).toBe("PLAN_METADATA_RECONCILE");
    expect(plan.goNoGo).toBe("GO");
    expect(plan.exactExpectedWriteCounts.successAuditResultCreates).toBe(0);
    expect(plan.exactExpectedWriteCounts.idempotencyPatches).toBe(1);
    expect(plan.exactPlannedMetadataDiff.successAuditResultCreate).toBeNull();
    expect(
      plan.exactPlannedMetadataDiff.idempotencyPatch?.patch.result.auditResultId,
    ).toBe("dwr_success_present");
  });

  it("conflict → NO-GO (no writes)", () => {
    const plan = planPhase5NMetadataReconciliation(
      phase5NFixtureConflictWrongIdempotencyStatus(),
    );
    expect(plan.goNoGo).toBe("NO-GO");
    expect(plan.conflictingMetadataDetected).toBe(true);
    expect(plan.exactExpectedWriteCounts.metadataWrites).toBe(0);
    expect(plan.exactPlannedMetadataDiff.successAuditResultCreate).toBeNull();
  });

  it("driver not needs_changes → NO-GO; domain write never planned", () => {
    const plan = planPhase5NMetadataReconciliation(
      phase5NFixtureConflictDriverNotNeedsChanges(),
    );
    expect(plan.goNoGo).toBe("NO-GO");
    expect(plan.driverDomainWriteRequired).toBe(false);
    expect(plan.forbiddenDomainWrites).toBe(0);
    expect(plan.exactExpectedWriteCounts.driverDomainWrites).toBe(0);
    expect(plan.exactPlannedMetadataDiff.domainWrites).toEqual([]);
  });

  it("undefined code omitted from success RESULT payload", () => {
    const payload = buildPhase5NSuccessAuditResultPayload({
      auditId: "dwr_x",
      driverId: "driver_fixture_uid",
      countryId: "saudi_arabia",
      fromState: "pending_review",
      toState: "needs_changes",
    });
    expect(Object.prototype.hasOwnProperty.call(payload, "code")).toBe(false);
    expect(payload.outcome).toBe("applied");
    expect(payload.kind).toBe("AUDIT_RESULT");
    expect(() => assertFirestoreDocumentHasNoUndefined(payload)).not.toThrow();
  });

  it("dry-run service: SKIP default; offline inject plans without writes", async () => {
    const skipped = await runPhase5NMetadataReconciliationDryRun({
      harnessArmed: false,
    });
    expect(skipped.summary.overallStatus).toBe("SKIPPED");
    expect(skipped.productionWriteInvoked).toBe(false);
    expect(skipped.domainCommandInvoked).toBe(false);

    const planned = await runPhase5NMetadataReconciliationDryRun({
      harnessArmed: true,
      observed: phase5NFixtureProductionIncomplete(),
      plannedSuccessAuditId: "dwr_phase5n_planned",
    });
    expect(planned.summary.goNoGo).toBe("GO");
    expect(planned.summary.productionWrites).toBe(0);
    expect(planned.summary.actualMetadataWrites).toBe(0);
    expect(planned.summary.applyAttempted).toBe(false);
    expect(planned.summary.driverDomainWriteRequired).toBe(false);
    expect(planned.summary.authClaimsRepairRequired).toBe(false);
    expect(planned.summary.forbiddenDomainWrites).toBe(0);
    expect(
      planned.summary.exactPlannedMetadataDiff.successAuditResultCreate?.payload
        .driverId,
    ).toBe("<redacted>");
    expect(planned.productionWriteInvoked).toBe(false);
    expect(planned.domainCommandInvoked).toBe(false);
  });

  it("apply stub always refuses live writes", async () => {
    const plan = planPhase5NMetadataReconciliation(
      phase5NFixtureProductionIncomplete(),
    );
    const stub = await runPhase5NMetadataReconciliationApplyStub({
      plan,
      envFlag: "1",
      writePort: {
        async createSuccessAuditResult() {
          throw new Error("must not be called");
        },
        async patchIdempotencyAuditResultId() {
          throw new Error("must not be called");
        },
      },
    });
    expect(stub.applyRefused).toBe(true);
    expect(stub.productionWriteInvoked).toBe(false);
    expect(stub.domainCommandInvoked).toBe(false);
    expect(stub.summary.applyAttempted).toBe(false);
    expect(stub.summary.productionWrites).toBe(0);
  });
});
