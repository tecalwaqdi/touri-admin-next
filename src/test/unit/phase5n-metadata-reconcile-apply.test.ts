/**
 * Phase 5N — offline unit tests for metadata reconcile APPLY path.
 * No Production writes. No RequestDriverChangesCommand.
 */

import { describe, expect, it } from "vitest";
import { assertFirestoreDocumentHasNoUndefined } from "@/application/controlled-writes/omitUndefinedForFirestore";
import { runPhase5NMetadataReconciliationApply } from "@/application/controlled-writes/pilot/Phase5NMetadataReconciliationApply";
import { createPhase5NFakeApplyPorts } from "@/application/controlled-writes/pilot/Phase5NFakePorts";
import {
  phase5NFixtureAlreadyComplete,
  phase5NFixtureConflictWrongIdempotencyStatus,
  phase5NFixtureProductionIncomplete,
  phase5NFixtureSuccessPresentIdempotencyIncomplete,
} from "@/application/controlled-writes/pilot/Phase5NFixtures";
import { PHASE_5N_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import { PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY } from "@/application/controlled-writes/pilot/Phase5NConstants";
import { evaluatePhase5NOperatorGates } from "@/application/controlled-writes/pilot/Phase5NOperatorGates";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
  OPERATOR_HARNESS_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { PHASE_5N_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/controlled-writes/pilot/Phase5NIamDerivation";

const PASS_GATES = {
  PHASE5N_METADATA_RECONCILE_APPLY: "1",
  GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
  PRODUCTION_WRITE_ENABLED: "true",
  DRIVER_WRITE_ENABLED: "false",
  AGENT_WRITE_ENABLED: "false",
  CUSTOMER_WRITE_ENABLED: "false",
  CUSTOMER_AUTH_WRITE_ENABLED: "false",
  FINANCE_WRITE_ENABLED: "false",
  SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "false",
  PHASE5M_DRIVER_PILOT_APPLY: "",
  EXPECTED_PROJECT_ID: PHASE_5N_EXPECTED_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: PHASE_5N_EXPECTED_PROJECT_ID,
} as const;

describe("Phase 5N — metadata reconcile apply (offline Fake)", () => {
  it("operator gates require metadata arm + production write; DRIVER_WRITE must be false", () => {
    expect(evaluatePhase5NOperatorGates(PASS_GATES).ok).toBe(true);
    expect(
      evaluatePhase5NOperatorGates({
        ...PASS_GATES,
        DRIVER_WRITE_ENABLED: "true",
      }).ok,
    ).toBe(false);
    expect(
      evaluatePhase5NOperatorGates({
        ...PASS_GATES,
        PHASE5M_DRIVER_PILOT_APPLY: "1",
      }).ok,
    ).toBe(false);
  });

  it("happy path Fake apply → PHASE5N_METADATA_RECONCILE_PASS (creates=1 patches=1)", async () => {
    const ports = createPhase5NFakeApplyPorts({
      observed: phase5NFixtureProductionIncomplete(),
    });
    const r = await runPhase5NMetadataReconciliationApply({
      harnessArmed: true,
      executeApply: true,
      ports,
      gates: PASS_GATES,
      // Same reference as fake store so plan + writes + verify share state.
      observed: ports.store.observed,
      plannedSuccessAuditId: "dwr_phase5n_unit_success",
    });

    expect(r.domainCommandInvoked).toBe(false);
    expect(r.summary.overallStatus).toBe("PHASE5N_METADATA_RECONCILE_PASS");
    expect(r.summary.applyAttempted).toBe(true);
    expect(r.summary.actualSuccessAuditResultCreates).toBe(1);
    expect(r.summary.actualIdempotencyPatches).toBe(1);
    expect(r.summary.metadataWrites).toBe(2);
    expect(r.summary.driverDomainWrites).toBe(0);
    expect(r.summary.authClaimWrites).toBe(0);
    expect(r.summary.financeWrites).toBe(0);
    expect(r.summary.tripWrites).toBe(0);
    expect(r.summary.agentWrites).toBe(0);
    expect(r.summary.customerWrites).toBe(0);
    expect(r.summary.forbiddenWritesZero).toBe(true);
    expect(r.summary.reconciliationVerified).toBe(true);
    expect(r.summary.driverStateAfter).toBe("needs_changes");
    expect(r.summary.alreadyReconciled).toBe(false);
    expect(ports.createdResults).toHaveLength(1);
    expect(
      Object.prototype.hasOwnProperty.call(
        ports.createdResults[0]!.payload,
        "code",
      ),
    ).toBe(false);
    expect(() =>
      assertFirestoreDocumentHasNoUndefined(ports.createdResults[0]!.payload),
    ).not.toThrow();
    expect(ports.idempotencyPatches).toHaveLength(1);
    expect(ports.idempotencyPatches[0]!.patch).toEqual({
      result: { auditResultId: "dwr_phase5n_unit_success" },
    });
    expect(ports.store.observed.idempotency?.result.auditResultId).toBe(
      "dwr_phase5n_unit_success",
    );
  });

  it("already reconciled → ALREADY_RECONCILED 0 writes; never second RESULT", async () => {
    const ports = createPhase5NFakeApplyPorts({
      observed: phase5NFixtureAlreadyComplete("dwr_already"),
    });
    const r = await runPhase5NMetadataReconciliationApply({
      harnessArmed: true,
      executeApply: true,
      ports,
      gates: PASS_GATES,
      observed: ports.store.observed,
    });
    expect(r.summary.overallStatus).toBe(
      "PHASE5N_METADATA_RECONCILE_ALREADY_RECONCILED",
    );
    expect(r.summary.alreadyReconciled).toBe(true);
    expect(r.summary.applyAttempted).toBe(false);
    expect(r.summary.metadataWrites).toBe(0);
    expect(r.summary.actualSuccessAuditResultCreates).toBe(0);
    expect(r.summary.actualIdempotencyPatches).toBe(0);
    expect(ports.createdResults).toHaveLength(0);
    expect(r.productionWriteInvoked).toBe(false);
  });

  it("precondition fail → applyAttempted=false writes=0 NO-GO", async () => {
    const ports = createPhase5NFakeApplyPorts({
      observed: phase5NFixtureConflictWrongIdempotencyStatus(),
    });
    const r = await runPhase5NMetadataReconciliationApply({
      harnessArmed: true,
      executeApply: true,
      ports,
      gates: PASS_GATES,
      observed: ports.store.observed,
    });
    expect(r.summary.overallStatus).toBe("PHASE5N_METADATA_RECONCILE_NO_GO");
    expect(r.summary.applyAttempted).toBe(false);
    expect(r.summary.metadataWrites).toBe(0);
    expect(r.summary.goNoGo).toBe("NO-GO");
    expect(ports.createdResults).toHaveLength(0);
  });

  it("conflict / refuse overwrite conflicting auditResultId", async () => {
    const base = phase5NFixtureProductionIncomplete();
    const conflicting = {
      ...base,
      idempotency: {
        ...base.idempotency!,
        result: {
          ...base.idempotency!.result,
          // Non-empty id pointing at missing success → planner conflict OR apply refuse
          auditResultId: "dwr_foreign_conflict",
          ok: true,
          status: "applied",
          toState: "needs_changes",
          auditIntentId: base.idempotency!.result.auditIntentId,
        },
      },
    };
    // Make planner see conflict via mismatch (success missing but id nonempty)
    const ports = createPhase5NFakeApplyPorts({ observed: conflicting });
    const r = await runPhase5NMetadataReconciliationApply({
      harnessArmed: true,
      executeApply: true,
      ports,
      gates: PASS_GATES,
      observed: ports.store.observed,
    });
    expect(r.summary.applyAttempted).toBe(false);
    expect(r.summary.metadataWrites).toBe(0);
    expect(r.summary.goNoGo).toBe("NO-GO");
    expect(ports.createdResults).toHaveLength(0);
  });

  it("domain / Auth / Finance never touched on happy path", async () => {
    const ports = createPhase5NFakeApplyPorts({
      observed: phase5NFixtureProductionIncomplete(),
    });
    const r = await runPhase5NMetadataReconciliationApply({
      harnessArmed: true,
      executeApply: true,
      ports,
      gates: PASS_GATES,
      observed: ports.store.observed,
      plannedSuccessAuditId: "dwr_phase5n_domain_guard",
    });
    expect(r.summary.overallStatus).toBe("PHASE5N_METADATA_RECONCILE_PASS");
    expect(ports.counter.driverDomainWrites).toBe(0);
    expect(ports.counter.authClaimWrites).toBe(0);
    expect(ports.counter.financeWrites).toBe(0);
    expect(ports.counter.tripWrites).toBe(0);
    expect(ports.counter.agentWrites).toBe(0);
    expect(ports.counter.customerWrites).toBe(0);
    expect(r.domainCommandInvoked).toBe(false);
  });

  it("undefined code omitted from created success RESULT", async () => {
    const ports = createPhase5NFakeApplyPorts({
      observed: phase5NFixtureProductionIncomplete(),
    });
    await runPhase5NMetadataReconciliationApply({
      harnessArmed: true,
      executeApply: true,
      ports,
      gates: PASS_GATES,
      observed: ports.store.observed,
      plannedSuccessAuditId: "dwr_phase5n_omit_code",
    });
    const payload = ports.createdResults[0]!.payload;
    expect(Object.prototype.hasOwnProperty.call(payload, "code")).toBe(false);
    expect(payload.outcome).toBe("applied");
    expect(payload.kind).toBe("AUDIT_RESULT");
    expect(() => assertFirestoreDocumentHasNoUndefined(payload)).not.toThrow();
  });

  it("patch-only recovery when success already present", async () => {
    const ports = createPhase5NFakeApplyPorts({
      observed: phase5NFixtureSuccessPresentIdempotencyIncomplete(
        "dwr_success_present",
      ),
    });
    const r = await runPhase5NMetadataReconciliationApply({
      harnessArmed: true,
      executeApply: true,
      ports,
      gates: PASS_GATES,
      observed: ports.store.observed,
    });
    expect(r.summary.actualSuccessAuditResultCreates).toBe(0);
    expect(r.summary.actualIdempotencyPatches).toBe(1);
    expect(r.summary.reconciliationVerified).toBe(true);
    expect(r.summary.overallStatus).toBe("PHASE5N_METADATA_RECONCILE_PASS");
    expect(ports.createdResults).toHaveLength(0);
    expect(ports.store.observed.idempotency?.result.auditResultId).toBe(
      "dwr_success_present",
    );
  });

  it("preserves PHASE5N_METADATA_RECONCILE_APPLY through sanitization", () => {
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5N_METADATA_RECONCILE_APPLY",
    );
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5N_METADATA_RECONCILE_DRY_RUN",
    );
    const captured = captureOperatorHarnessEnv({
      PHASE5N_METADATA_RECONCILE_APPLY: "1",
      PHASE5N_METADATA_RECONCILE_DRY_RUN: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5N_METADATA_RECONCILE_APPLY: undefined,
      PHASE5N_METADATA_RECONCILE_DRY_RUN: undefined,
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5N_METADATA_RECONCILE_APPLY).toBe("1");
    expect(env.PHASE5N_METADATA_RECONCILE_DRY_RUN).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });

  it("documents exact IAM permissions for operator ADC", () => {
    expect(PHASE_5N_REQUIRED_OPERATOR_IAM_PERMISSIONS).toEqual([
      "datastore.entities.get",
      "datastore.entities.create",
      "datastore.entities.update",
      "firebaseauth.users.get",
    ]);
    expect(PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY).toBe(
      "phase5l_driver_needs_changes_pilot_v1",
    );
  });

  it("SKIP default when harness not armed", async () => {
    const r = await runPhase5NMetadataReconciliationApply({
      harnessArmed: false,
    });
    expect(r.summary.overallStatus).toBe("SKIPPED");
    expect(r.summary.applyAttempted).toBe(false);
    expect(r.summary.metadataWrites).toBe(0);
  });
});
