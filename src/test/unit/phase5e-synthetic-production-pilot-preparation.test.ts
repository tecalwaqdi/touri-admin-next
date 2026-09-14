/**
 * Phase 5E — offline unit contracts for dry-run / guards / allowlist / diff.
 * Production writes = 0. No live Firebase.
 */
import { describe, expect, it } from "vitest";
import {
  AUTH_REQUIRED_FOR_PILOT_TARGET,
  PHASE_5E_EXPECTED_PROJECT_ID,
  PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
  SYNTHETIC_DRIVER_SCHEMA_REQUIREMENTS,
  assertPilotTargetIsSynthetic,
  assessAuthDependencyForPilot,
} from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";
import {
  PHASE_5E_ALLOWED_DOMAIN_DIFF,
  PHASE_5E_EXACT_AFTER_STATE,
  PHASE_5E_EXACT_BEFORE_STATE,
  PHASE_5E_NEEDS_CHANGES_FIRESTORE_ALLOWLIST,
  assertFirestorePatchAllowlisted,
  buildNeedsChangesAllowlistedPatch,
  evaluatePilotDomainDiff,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotDiffContract";
import {
  PHASE_5E_EXPECTED_WRITE_COUNTS_FUTURE_PILOT,
  PHASE_5E_EXPECTED_WRITE_COUNTS_PREPARATION,
  PHASE_5E_FLAG_ACTIVATION_PLAN,
  PHASE_5E_FUTURE_EXECUTION_SEQUENCE,
  PHASE_5E_ISOLATION_GUARANTEES,
  PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED,
  PHASE_5E_PRECONDITION_AND_IDEMPOTENCY_PLAN,
  buildPhase5ERollbackPlan,
  buildPreparationObservabilitySummary,
  evaluatePhase5EPilotGate,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotGates";
import { runPhase5EDriverPilotDryRun } from "@/application/controlled-writes/pilot/Phase5EDriverPilotDryRun";
import {
  PRODUCTION_DRIVER_WRITE_REPO_REVIEW,
  planProductionDriverWriteTransaction,
} from "@/application/controlled-writes/pilot/Phase5EProductionDriverWriteAllowlist";
import {
  isPhase5EDriverPilotDryRunEnabled,
  isPhase5EDriverPilotEnabled,
} from "@/application/controlled-writes/pilot/isPhase5EDriverPilotEnabled";
import {
  ProductionDriverWriteRepository,
  createApproveDriverCommand,
  createRequestDriverChangesCommand,
} from "@/application/controlled-writes/drivers";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import type { VerifiedDriverWriteActor } from "@/application/controlled-writes/drivers/DriverWriteTypes";

const superAdmin: VerifiedDriverWriteActor = {
  uid: "op_super_5e",
  role: "super_admin",
  permissions: ["drivers:approve"],
  scope: { type: "global" },
};

describe("Phase 5E — enablement posture unchanged", () => {
  it("controlledWritesEnabled and productionWritesEnabled remain false", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesImplemented).toBe(true);
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesValidatedOffline).toBe(
      true,
    );
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
  });

  it("flag activation plan documents all false now", () => {
    expect(PHASE_5E_FLAG_ACTIVATION_PLAN.current.DRIVER_WRITE_ENABLED).toBe(
      false,
    );
    expect(PHASE_5E_FLAG_ACTIVATION_PLAN.current.FINANCE_WRITE_ENABLED).toBe(
      false,
    );
    expect(PHASE_5E_FLAG_ACTIVATION_PLAN.temporaryWindow.maxAttempts).toBe(1);
    expect(
      PHASE_5E_FLAG_ACTIVATION_PLAN.temporaryWindow.failClosedAfterAttempt,
    ).toBe(true);
    expect(PHASE_5E_FLAG_ACTIVATION_PLAN.temporaryWindow.autoProgression).toBe(
      false,
    );
  });
});

describe("Phase 5E — why needs_changes is safest", () => {
  it("recommended Pilot remains Driver needs_changes", () => {
    expect(PHASE_5E_EXACT_BEFORE_STATE.action).toBe("needs_changes");
    expect(PHASE_5E_EXACT_BEFORE_STATE.registrationStatus).toBe(
      "pending_review",
    );
    expect(PHASE_5E_EXACT_AFTER_STATE.registrationStatus).toBe("needs_changes");
  });

  it("Auth not required; isolation zeros", () => {
    expect(AUTH_REQUIRED_FOR_PILOT_TARGET).toBe(false);
    expect(assessAuthDependencyForPilot().createFakeAuthUser).toBe("forbidden");
    expect(PHASE_5E_ISOLATION_GUARANTEES.authWrites).toBe(0);
    expect(PHASE_5E_ISOLATION_GUARANTEES.financeWrites).toBe(0);
    expect(PHASE_5E_ISOLATION_GUARANTEES.tripWrites).toBe(0);
    expect(PHASE_5E_ISOLATION_GUARANTEES.agentWrites).toBe(0);
    expect(PHASE_5E_ISOLATION_GUARANTEES.customerWrites).toBe(0);
  });
});

describe("Phase 5E — synthetic markers + schema", () => {
  it("strategy id matches test_ prefix and schema collection=user", () => {
    expect(PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY.startsWith("test_")).toBe(
      true,
    );
    expect(SYNTHETIC_DRIVER_SCHEMA_REQUIREMENTS.collection).toBe("user");
    expect(
      assertPilotTargetIsSynthetic({
        driverId: PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
        data: { is_test: true, functional_test: true },
      }).ok,
    ).toBe(true);
  });

  it("non-synthetic real-looking id → PILOT_TARGET_NOT_SYNTHETIC", () => {
    const r = assertPilotTargetIsSynthetic({
      driverId: "realUserUidAbc123XYZ",
      data: { ismndob: true },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("PILOT_TARGET_NOT_SYNTHETIC");
  });
});

describe("Phase 5E — allowlist + diff contracts", () => {
  it("needs_changes patch is registration_status only", () => {
    const patch = buildNeedsChangesAllowlistedPatch();
    expect(patch).toEqual({ registration_status: "needs_changes" });
    expect(assertFirestorePatchAllowlisted(patch).ok).toBe(true);
    expect(PHASE_5E_NEEDS_CHANGES_FIRESTORE_ALLOWLIST).toEqual([
      "registration_status",
    ]);
  });

  it("extra Firestore field → PILOT_UNEXPECTED_FIELD_MUTATION", () => {
    const bad = assertFirestorePatchAllowlisted({
      registration_status: "needs_changes",
      actev_mndob: false,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.code).toBe("PILOT_UNEXPECTED_FIELD_MUTATION");
      expect(bad.unexpectedFields).toContain("actev_mndob");
    }
  });

  it("domain diff allows registrationStatus + preconditionToken only", () => {
    const okDiff = evaluatePilotDomainDiff({
      before: {
        registrationStatus: "pending_review",
        preconditionToken: "tok_a",
        accountEnabled: "disabled",
        tripState: "idle",
      },
      after: {
        registrationStatus: "needs_changes",
        preconditionToken: "tok_b",
        accountEnabled: "disabled",
        tripState: "idle",
      },
    });
    expect(okDiff.ok).toBe(true);
    expect(PHASE_5E_ALLOWED_DOMAIN_DIFF).toContain("registrationStatus");

    const badDiff = evaluatePilotDomainDiff({
      before: { accountEnabled: "disabled", registrationStatus: "pending_review" },
      after: { accountEnabled: "enabled", registrationStatus: "needs_changes" },
    });
    expect(badDiff.ok).toBe(false);
    expect(badDiff.unexpected[0]?.ok).toBe(false);
    if (badDiff.unexpected[0]?.ok === false) {
      expect(badDiff.unexpected[0].code).toBe("PILOT_UNEXPECTED_FIELD_MUTATION");
    }
  });
});

describe("Phase 5E — single-use gate", () => {
  it("default SKIP without PHASE5E_DRIVER_PILOT=1", () => {
    const r = evaluatePhase5EPilotGate({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PHASE5E_DRIVER_PILOT_SKIP");
  });

  it("gate=1 but missing PILOT_DRIVER_ID → PILOT_DRIVER_ID_REQUIRED", () => {
    const r = evaluatePhase5EPilotGate({
      PHASE5E_DRIVER_PILOT: "1",
      projectId: PHASE_5E_EXPECTED_PROJECT_ID,
      expectedBeforeState: "pending_review",
      preconditionToken: "tok_1",
      operatorIdentity: "op@touri",
      actorRole: "super_admin",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PILOT_DRIVER_ID_REQUIRED");
  });

  it("non-synthetic target → PILOT_TARGET_NOT_SYNTHETIC", () => {
    const r = evaluatePhase5EPilotGate({
      PHASE5E_DRIVER_PILOT: "1",
      projectId: PHASE_5E_EXPECTED_PROJECT_ID,
      pilotDriverId: "prodDriverReal001",
      expectedBeforeState: "pending_review",
      preconditionToken: "tok_1",
      operatorIdentity: "op@touri",
      actorRole: "super_admin",
      targetData: { ismndob: true },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PILOT_TARGET_NOT_SYNTHETIC");
  });

  it("write flags true → fail-closed PILOT_WRITE_FLAGS_MUST_REMAIN_FALSE", () => {
    const r = evaluatePhase5EPilotGate(
      {
        PHASE5E_DRIVER_PILOT: "1",
        projectId: PHASE_5E_EXPECTED_PROJECT_ID,
        pilotDriverId: PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
        expectedBeforeState: "pending_review",
        preconditionToken: "tok_1",
        operatorIdentity: "op@touri",
        actorRole: "super_admin",
      },
      {
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        DRIVER_WRITE_ENABLED: true,
        controlledWritesEnabled: false,
        productionWritesEnabled: false,
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PILOT_WRITE_FLAGS_MUST_REMAIN_FALSE");
  });

  it("complete gate requirements pass with flags false (still no write)", () => {
    const r = evaluatePhase5EPilotGate({
      PHASE5E_DRIVER_PILOT: "1",
      projectId: PHASE_5E_EXPECTED_PROJECT_ID,
      pilotDriverId: PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
      expectedBeforeState: "pending_review",
      preconditionToken: "tok_captured",
      operatorIdentity: "op_super_5e",
      actorRole: PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED,
    });
    expect(r.ok).toBe(true);
  });

  it("non-super_admin denied", () => {
    const r = evaluatePhase5EPilotGate({
      PHASE5E_DRIVER_PILOT: "1",
      projectId: PHASE_5E_EXPECTED_PROJECT_ID,
      pilotDriverId: PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
      expectedBeforeState: "pending_review",
      preconditionToken: "tok_1",
      operatorIdentity: "op",
      actorRole: "operations_manager",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PILOT_ACTOR_NOT_SUPER_ADMIN");
  });
});

describe("Phase 5E — dry-run", () => {
  it("env helpers: only exact 1 enables", () => {
    expect(isPhase5EDriverPilotEnabled(undefined)).toBe(false);
    expect(isPhase5EDriverPilotEnabled("0")).toBe(false);
    expect(isPhase5EDriverPilotEnabled("1")).toBe(true);
    expect(isPhase5EDriverPilotDryRunEnabled("1")).toBe(true);
    expect(isPhase5EDriverPilotDryRunEnabled("true")).toBe(false);
  });

  it("dry-run plans write with wouldWrite=true actualWrite=false writes=0", () => {
    const result = runPhase5EDriverPilotDryRun({
      projectId: PHASE_5E_EXPECTED_PROJECT_ID,
      pilotDriverId: PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
      expectedBeforeState: "pending_review",
      preconditionToken: "tok_dry_1",
      operatorIdentity: "op_super_5e",
      actorRole: "super_admin",
      observed: {
        registrationStatus: "pending_review",
        accountEnabled: "disabled",
        tripState: "idle",
        isOperationalDriver: true,
        is_test: true,
        functional_test: true,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.wouldWrite).toBe(true);
    expect(result.actualWrite).toBe(false);
    expect(result.productionWrites).toBe(0);
    expect(result.authWrites).toBe(0);
    expect(result.financeWrites).toBe(0);
    expect(result.tripWrites).toBe(0);
    expect(result.writeFlagsRemainFalse).toBe(true);
    expect(result.observability.productionWriteExecuted).toBe(false);
    expect(result.AUTH_REQUIRED_FOR_PILOT_TARGET).toBe(false);
  });

  it("dry-run denies busy trip", () => {
    const result = runPhase5EDriverPilotDryRun({
      projectId: PHASE_5E_EXPECTED_PROJECT_ID,
      pilotDriverId: PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
      expectedBeforeState: "pending_review",
      preconditionToken: "tok_dry_2",
      operatorIdentity: "op_super_5e",
      actorRole: "super_admin",
      observed: { tripState: "busy", isOperationalDriver: true },
    });
    expect(result.ok).toBe(false);
    expect(result.actualWrite).toBe(false);
    expect(result.wouldWrite).toBe(false);
  });
});

describe("Phase 5E — rollback + write counts + observability", () => {
  it("rollback is controlled recovery (admin needs_changes→pending_review unsupported)", () => {
    const plan = buildPhase5ERollbackPlan();
    expect(plan.adminNeedsChangesToPendingReviewSupported).toBe(false);
    expect(plan.provenTransitionExists).toBe(true);
    expect(plan.provenAction).toBe("resubmit_to_review");
    expect(plan.executeInPhase5E).toBe(false);
    expect(plan.recoveryAllowlist).toEqual(["registration_status"]);
  });

  it("preparation write counts are zero; future Pilot differentiated", () => {
    expect(PHASE_5E_EXPECTED_WRITE_COUNTS_PREPARATION.driverDomain).toBe(0);
    expect(PHASE_5E_EXPECTED_WRITE_COUNTS_PREPARATION.productionWrites).toBe(0);
    expect(PHASE_5E_EXPECTED_WRITE_COUNTS_FUTURE_PILOT.driverDomain).toBe(1);
    expect(PHASE_5E_EXPECTED_WRITE_COUNTS_FUTURE_PILOT.auditIntent).toBe(1);
    expect(PHASE_5E_EXPECTED_WRITE_COUNTS_FUTURE_PILOT.auditResult).toBe(1);
    expect(PHASE_5E_EXPECTED_WRITE_COUNTS_FUTURE_PILOT.idempotency).toBe(1);
    expect(PHASE_5E_EXPECTED_WRITE_COUNTS_FUTURE_PILOT.auth).toBe(0);
    expect(PHASE_5E_EXPECTED_WRITE_COUNTS_FUTURE_PILOT.finance).toBe(0);
  });

  it("observability summary has no PII fields and productionWriteExecuted=false", () => {
    const obs = buildPreparationObservabilitySummary();
    expect(obs.productionWriteExecuted).toBe(false);
    expect(obs.actualWrite).toBe(false);
    expect(JSON.stringify(obs)).not.toMatch(/@|phone|iban/i);
    expect(
      PHASE_5E_PRECONDITION_AND_IDEMPOTENCY_PLAN.auditExpectationsFuturePilot
        .productionWriteExecuted,
    ).toBe(true);
  });

  it("future execution sequence is documented without auto progression", () => {
    expect(PHASE_5E_FUTURE_EXECUTION_SEQUENCE.length).toBe(6);
    expect(PHASE_5E_FUTURE_EXECUTION_SEQUENCE[0]).toContain("dry_run");
    expect(PHASE_5E_FLAG_ACTIVATION_PLAN.temporaryWindow.autoProgression).toBe(
      false,
    );
  });
});

describe("Phase 5E — ProductionDriverWriteRepository review (unreachable)", () => {
  it("review constants: activated=false, allowlisted, no arbitrary payload", () => {
    expect(PRODUCTION_DRIVER_WRITE_REPO_REVIEW.activated).toBe(false);
    expect(PRODUCTION_DRIVER_WRITE_REPO_REVIEW.arbitraryRecordPayload).toBe(
      false,
    );
    expect(PRODUCTION_DRIVER_WRITE_REPO_REVIEW.allowlistedFieldsOnly).toBe(true);
    expect(ProductionDriverWriteRepository.review.activated).toBe(false);
  });

  it("planAllowlistedTransaction returns typed needs_changes patch", () => {
    const prod = new ProductionDriverWriteRepository({
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
    });
    const plan = prod.planAllowlistedTransaction({
      command: createRequestDriverChangesCommand({
        actor: superAdmin,
        driverId: PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
        expectedCurrentState: "pending_review",
        preconditionToken: "tok_plan",
        idempotencyKey: "idem_5e_plan_01",
        correlationId: "corr_5e",
        reasonCode: "photo_quality",
      }),
      snapshot: {
        driverId: PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
        exists: true,
        isOperationalDriver: true,
        registrationStatus: "pending_review",
        accountEnabled: "disabled",
        complianceStatus: "incomplete",
        tripState: "idle",
        countryId: "sa",
        countryScopeKind: "mapped",
        preconditionToken: "tok_plan",
      },
      fromState: "pending_review",
      toState: "needs_changes",
    });
    expect(plan.arbitraryPayloadAllowed).toBe(false);
    expect(plan.patch).toEqual({ registration_status: "needs_changes" });
    expect(plan.mode).toBe("transaction_with_precondition");
  });

  it("apply remains unreachable even if flags flipped", async () => {
    const prod = new ProductionDriverWriteRepository({
      GLOBAL_PRODUCTION_WRITE_ENABLED: true,
      DRIVER_WRITE_ENABLED: true,
    });
    await expect(
      prod.apply({
        command: createApproveDriverCommand({
          actor: superAdmin,
          driverId: "DRV1",
          expectedCurrentState: "pending_review",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_5e_unreach",
          correlationId: "corr_5e",
        }),
        snapshot: {
          driverId: "DRV1",
          exists: true,
          isOperationalDriver: true,
          registrationStatus: "pending_review",
          accountEnabled: "disabled",
          complianceStatus: "ready",
          tripState: "idle",
          countryId: "sa",
          countryScopeKind: "mapped",
          preconditionToken: "tok_1",
        },
        fromState: "pending_review",
        toState: "approved",
      }),
    ).rejects.toMatchObject({ code: "PRODUCTION_WRITE_DISABLED" });
  });

  it("standalone planProductionDriverWriteTransaction matches allowlist", () => {
    const plan = planProductionDriverWriteTransaction({
      action: "needs_changes",
      driverId: PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
      preconditionToken: "tok_x",
      fromState: "pending_review",
      toState: "needs_changes",
    });
    expect(plan.onUnexpectedField).toBe("PILOT_UNEXPECTED_FIELD_MUTATION");
    expect(Object.keys(plan.patch)).toEqual(["registration_status"]);
  });
});
