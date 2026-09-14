/**
 * Phase 5H pivot — offline unit contracts for existing approved synthetic
 * Driver Pilot qualification (approved→suspended / rollback).
 * Production writes = 0. No live Firebase. No suspend. No Auth create.
 */
import { describe, expect, it } from "vitest";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { resolveDriverTransition } from "@/application/controlled-writes/drivers/DriverStateMachine";
import { isPhase5HExistingApprovedDriverDryRunEnabled } from "@/application/controlled-writes/pilot/isPhase5HExistingApprovedDriverDryRunEnabled";
import {
  assessAuthImpactForApprovedSuspendPilot,
  PHASE_5H_APPROVED_UPDATE_TRIGGER_ANALYSIS,
} from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverAuthImpact";
import {
  buildExactRollbackDiffPlan,
  buildExactSuspendDiffPlan,
  PHASE_5H_EXPECTED_FUTURE_ROLLBACK_WRITE_COUNTS,
  PHASE_5H_EXPECTED_FUTURE_SUSPEND_WRITE_COUNTS,
  PHASE_5H_EXPECTED_QUALIFICATION_SESSION_WRITES,
  PHASE_5H_ROLLBACK_IDEMPOTENCY_KEY,
  PHASE_5H_SUSPEND_IDEMPOTENCY_KEY,
  PHASE_5H_SUSPEND_ROLLBACK_NON_ALLOWLIST_FIELDS,
  planRollbackTransaction,
  planSuspendTransaction,
} from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverDiffContract";
import {
  qualifyExistingApprovedSyntheticDriver,
} from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverQualification";
import {
  assertPhase5HExistingApprovedWriteFlagsFalse,
  PHASE_5H_EXISTING_APPROVED_WRITE_FLAGS_FALSE,
  runPhase5HExistingApprovedDriverDryRun,
} from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverDryRun";
import { AUTH_REQUIRED_FOR_FIXTURE } from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";
import { buildPhase5GInventoryRecord } from "@/application/controlled-writes/pilot/Phase5GInventoryRecord";
import { enumeratePhase5GTargetActionCandidates } from "@/application/controlled-writes/pilot/Phase5GPilotActionSafety";
import { classifyPhase5GSyntheticEvidence } from "@/application/controlled-writes/pilot/Phase5GSyntheticEvidence";

describe("Phase 5H existing approved — enablement / write flags", () => {
  it("1. write flags remain false; controlled writes not activated", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(assertPhase5HExistingApprovedWriteFlagsFalse()).toBe(true);
    expect(PHASE_5H_EXISTING_APPROVED_WRITE_FLAGS_FALSE.DRIVER_WRITE_ENABLED).toBe(
      false,
    );
    expect(
      ProductionDriverWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
      }),
    ).toBe(false);
  });

  it("2. dry-run env exact 1 only; default SKIP", () => {
    expect(isPhase5HExistingApprovedDriverDryRunEnabled(undefined)).toBe(false);
    expect(isPhase5HExistingApprovedDriverDryRunEnabled("0")).toBe(false);
    expect(isPhase5HExistingApprovedDriverDryRunEnabled("true")).toBe(false);
    expect(isPhase5HExistingApprovedDriverDryRunEnabled("1")).toBe(true);
  });
});

describe("Phase 5H existing approved — synthetic / state / trip / finance", () => {
  it("3. Phase 5G selection: approved synthetic with idle trip is base-eligible but suspend≠SAFE", () => {
    const row = buildPhase5GInventoryRecord({
      documentId: "test_phase5h_approved_gate",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        is_test: true,
        on_trip: false,
        mndon_newacc: false,
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      },
    });
    expect(row).not.toBeNull();
    expect(row!.registrationStatus).toBe("approved");
    expect(row!.operationalDriver).toBe(true);
    expect(row!.tripState).toBe("idle");
    expect(row!.hasActiveTrip).toBe(false);
    expect(row!.safePilotEligible).toBe(true);
    const suspend = enumeratePhase5GTargetActionCandidates(row!).find(
      (c) => c.action === "suspend",
    );
    expect(suspend?.safetyRank).toBe("ACCEPTABLE_WITH_CAUTION");
    expect(suspend?.plannedState).toBe("suspended");
  });

  it("4. PILOT_TARGET_NOT_SYNTHETIC when markers missing", () => {
    const evidence = classifyPhase5GSyntheticEvidence({
      documentId: "realLookingUidWithoutMarkers0123456789",
      data: { ismndob: true, registration_status: "approved" },
    });
    expect(evidence.ok).toBe(false);
    const q = qualifyExistingApprovedSyntheticDriver({
      documentId: "realLookingUidWithoutMarkers0123456789",
      data: { ismndob: true, registration_status: "approved", actev_mndob: true },
      offlineContractOnly: false,
    });
    expect(q.noGoCodes).toContain("PILOT_TARGET_NOT_SYNTHETIC");
    expect(q.EXISTING_APPROVED_SYNTHETIC_PILOT).toBe("NO_GO");
  });

  it("5. DRIVER_HAS_ACTIVE_TRIP when trip busy", () => {
    const q = qualifyExistingApprovedSyntheticDriver({
      documentId: "test_phase5h_busy",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        is_test: true,
        on_trip: true,
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      },
      offlineContractOnly: false,
    });
    expect(q.activeTrip.code).toBe("DRIVER_HAS_ACTIVE_TRIP");
    expect(q.noGoCodes).toContain("DRIVER_HAS_ACTIVE_TRIP");
  });

  it("6. finance unknown/present → NO-GO", () => {
    const q = qualifyExistingApprovedSyntheticDriver({
      documentId: "test_phase5h_finance",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        is_test: true,
        on_trip: false,
        mndon_newacc: false,
        Outstandingonlinepayment: 12,
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      },
      offlineContractOnly: false,
    });
    expect(q.noGoCodes).toContain("FINANCE_UNKNOWN_OR_PRESENT");
    expect(q.finance.pendingSettlement).toBe(true);
  });
});

describe("Phase 5H existing approved — Auth / Cloud Functions", () => {
  it("7. AUTH_SIDE_EFFECT_PRESENT via syncUserClaimsOnWrite on update", () => {
    expect(AUTH_REQUIRED_FOR_FIXTURE).toBe(true);
    const a = assessAuthImpactForApprovedSuspendPilot();
    expect(a.AUTH_SIDE_EFFECT_PRESENT).toBe(true);
    expect(a.authImpact).toBe("present");
    expect(a.authWritesExpected).toBe(1);
    expect(a.setCustomUserClaimsAlwaysCalledOnUpdate).toBe(true);
    expect(a.claimsPayloadDependsOnRegistrationStatus).toBe(false);
    expect(a.highRiskTriggers).toContain("syncUserClaimsOnWrite");
    expect(a.recommendationIfNoGo).toBe(
      "AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING",
    );
  });

  it("8. update trigger inventory classifies Auth high-risk; finance/trip none", () => {
    const sync = PHASE_5H_APPROVED_UPDATE_TRIGGER_ANALYSIS.find(
      (r) => r.exportName === "syncUserClaimsOnWrite",
    );
    expect(sync?.firesOnUserDocUpdate).toBe(true);
    expect(sync?.classification).toBe("high-risk");
    expect(sync?.authDependency).toBe(true);
    expect(sync?.financeDependency).toBe(false);
    expect(sync?.tripDependency).toBe(false);
    const wallet = PHASE_5H_APPROVED_UPDATE_TRIGGER_ANALYSIS.find(
      (r) => r.exportName === "adminAdjustDriverWallet",
    );
    expect(wallet?.firesOnUserDocUpdate).toBe(false);
  });
});

describe("Phase 5H existing approved — suspend / rollback diffs", () => {
  it("9. exact suspend allowlist is registration_status=suspended only", () => {
    const d = buildExactSuspendDiffPlan();
    expect(d.patch).toEqual({ registration_status: "suspended" });
    expect(d.allowlistedFields).toEqual(["registration_status"]);
    expect(d.productionWritesActevMndob).toBe(false);
    expect(d.idempotencyKey).toBe(PHASE_5H_SUSPEND_IDEMPOTENCY_KEY);
    const t = resolveDriverTransition("suspend", "approved");
    expect(t.ok && t.to).toBe("suspended");
  });

  it("10. exact rollback allowlist is registration_status=approved; rollbackSafe=false", () => {
    const d = buildExactRollbackDiffPlan();
    expect(d.patch).toEqual({ registration_status: "approved" });
    expect(d.approvalRevalidationRequired).toBe(false);
    expect(d.authSideEffectOnRollback).toBe(true);
    expect(d.idempotencyKey).toBe(PHASE_5H_ROLLBACK_IDEMPOTENCY_KEY);
    expect(d.idempotencyKey).not.toBe(PHASE_5H_SUSPEND_IDEMPOTENCY_KEY);
    const t = resolveDriverTransition("approve", "suspended");
    expect(t.ok && t.to).toBe("approved");
  });

  it("11. Production transaction plans typed; no arbitrary payload; actev not allowlisted", () => {
    const s = planSuspendTransaction({
      driverId: "test_x",
      preconditionToken: "tok",
    });
    expect(s.patch).toEqual({ registration_status: "suspended" });
    expect(s.arbitraryPayloadAllowed).toBe(false);
    const r = planRollbackTransaction({
      driverId: "test_x",
      preconditionToken: "tok",
    });
    expect(r.patch).toEqual({ registration_status: "approved" });
    expect(PHASE_5H_SUSPEND_ROLLBACK_NON_ALLOWLIST_FIELDS).toContain(
      "actev_mndob",
    );
  });

  it("12. future write counts known; Auth≥1 blocks GO; session zeros", () => {
    expect(PHASE_5H_EXPECTED_FUTURE_SUSPEND_WRITE_COUNTS.authWrites).toBe(1);
    expect(PHASE_5H_EXPECTED_FUTURE_SUSPEND_WRITE_COUNTS.domainWrites).toBe(1);
    expect(PHASE_5H_EXPECTED_FUTURE_SUSPEND_WRITE_COUNTS.financeWrites).toBe(0);
    expect(PHASE_5H_EXPECTED_FUTURE_SUSPEND_WRITE_COUNTS.tripWrites).toBe(0);
    expect(PHASE_5H_EXPECTED_FUTURE_ROLLBACK_WRITE_COUNTS.authWrites).toBe(1);
    expect(PHASE_5H_EXPECTED_QUALIFICATION_SESSION_WRITES).toEqual({
      domainWrites: 0,
      auditWrites: 0,
      idempotencyWrites: 0,
      triggerSideEffectWrites: 0,
      authWrites: 0,
      financeWrites: 0,
      tripWrites: 0,
    });
  });
});

describe("Phase 5H existing approved — qualification verdict", () => {
  it("13. offline PENDING_OPERATOR + Auth → EXISTING_APPROVED_SYNTHETIC_PILOT=NO_GO", () => {
    const q = qualifyExistingApprovedSyntheticDriver({
      documentId: null,
      offlineContractOnly: true,
    });
    expect(q.safeTargetId).toBe("PENDING_OPERATOR");
    expect(q.EXISTING_APPROVED_SYNTHETIC_PILOT).toBe("NO_GO");
    expect(q.verdict).toBe("NO_GO");
    expect(q.noGoCodes).toContain("AUTH_SIDE_EFFECT_PRESENT");
    expect(q.noGoCodes).toContain("ROLLBACK_NOT_SAFE");
    expect(q.noGoCodes).toContain("PENDING_OPERATOR_TARGET_ID");
    expect(q.rollbackSupported).toBe(true);
    expect(q.rollbackSafe).toBe(false);
    expect(q.recommendation).toBe("AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING");
    expect(q.silentFallbackToOtherDriver).toBe(false);
    expect(q.productionWrites).toBe(0);
    expect(q.authWrites).toBe(0);
    expect(q.qualificationScore).toBeLessThan(50);
  });

  it("14. live-shaped approved synthetic still NO-GO on Auth (no silent fallback)", () => {
    const q = qualifyExistingApprovedSyntheticDriver({
      documentId: "test_phase5g_approved_live_shaped",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        is_test: true,
        functional_test: true,
        on_trip: false,
        mndon_newacc: false,
        is_online: false,
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      },
      offlineContractOnly: false,
    });
    expect(q.safeTargetId).toBe("test_phase5g_approved_live_shaped");
    expect(q.syntheticProof.ok).toBe(true);
    expect(q.currentState.registrationStatus).toBe("approved");
    expect(q.currentState.operationalDriver).toBe(true);
    expect(q.currentState.authoritativeRole).toBe("driver");
    expect(q.activeTrip).toEqual({ hasActiveTrip: false, tripState: "idle" });
    expect(q.finance.financialImpact).toBe("none");
    expect(q.finance.pendingSettlement).toBe(false);
    expect(q.finance.walletMutationRequired).toBe(false);
    expect(q.realUserImpact).toBe("none");
    expect(q.auth.AUTH_SIDE_EFFECT_PRESENT).toBe(true);
    expect(q.EXISTING_APPROVED_SYNTHETIC_PILOT).toBe("NO_GO");
    expect(q.noGoCodes).toContain("AUTH_SIDE_EFFECT_PRESENT");
  });

  it("15. dry-run actualWrite=false; wouldWrite=false; SKIP without env", () => {
    const skip = runPhase5HExistingApprovedDriverDryRun({ envFlag: undefined });
    expect(skip.envEnabled).toBe(false);
    expect(skip.dryRunReadiness).toBe("SKIP");
    expect(skip.actualWrite).toBe(false);
    expect(skip.wouldWrite).toBe(false);
    expect(skip.productionApplyInvocationCount).toBe(0);

    const run = runPhase5HExistingApprovedDriverDryRun({ envFlag: "1" });
    expect(run.envEnabled).toBe(true);
    expect(run.dryRunReadiness).toBe("READY_OFFLINE_NO_GO");
    expect(run.qualification.EXISTING_APPROVED_SYNTHETIC_PILOT).toBe("NO_GO");
    expect(run.suspendPlanPatch).toEqual({ registration_status: "suspended" });
    expect(run.rollbackPlanPatch).toEqual({ registration_status: "approved" });
    expect(run.productionWrites).toBe(0);
    expect(run.authWrites).toBe(0);
    expect(run.financeWrites).toBe(0);
    expect(run.tripWrites).toBe(0);
    expect(run.productionRepoReachable).toBe(false);
  });

  it("16. RBAC/scope/precondition/audit plan documented without raw token", () => {
    const q = qualifyExistingApprovedSyntheticDriver();
    expect(q.rbacScope.requiredRole).toBe("super_admin");
    expect(q.rbacScope.permission).toBe("drivers:approve");
    expect(q.precondition.expectedCurrentState).toBe("approved");
    expect(q.precondition.rawTokenExposed).toBe(false);
    expect(q.idempotencyKeys.separate).toBe(true);
    expect(q.auditPlan.noPii).toBe(true);
    expect(q.phase5GNote.syntheticDriversFoundLive).toBe(5);
    expect(q.phase5GNote.approvedLive).toBe(1);
    expect(q.phase5GNote.safePilotCandidatesLive).toBe(0);
  });
});
