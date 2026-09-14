/**
 * Phase 5H — offline unit contracts (§22):
 * schema / Auth / triggers / geography / synthetic / allowlist / semantics /
 * rollback / repo / dry-run / Pilot compatibility / write-flag guards.
 * Production writes = 0. No live Firebase. No Auth create.
 */
import { describe, expect, it } from "vitest";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  AUTH_REQUIRED_FOR_FIXTURE,
  FIXTURE_CREATION_NO_GO,
  PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
  PHASE_5H_USER_DOC_TRIGGER_ANALYSIS,
  assessAuthDependencyForFixture,
} from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";
import {
  PHASE_5H_FIXTURE_FORBIDDEN_FIELDS,
  PHASE_5H_FIXTURE_CITY_ID,
  PHASE_5H_FIXTURE_COUNTRY_ID,
  PHASE_5H_PII_POLICY,
  PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC,
  assertPhase5HFixturePilotCompatibility,
  resolvePhase5HFixtureGeography,
} from "@/application/controlled-writes/pilot/Phase5HSyntheticDriverFixtureSchema";
import {
  PHASE_5H_EXPECTED_WRITE_COUNTS_FUTURE_CREATE_BLOCKED,
  PHASE_5H_EXPECTED_WRITE_COUNTS_FUTURE_CREATE_IF_UNBLOCKED,
  PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION,
  PHASE_5H_FIXTURE_CREATE_ALLOWLIST,
  assertCreateAllowlistTyped,
} from "@/application/controlled-writes/pilot/Phase5HFixtureCreateAllowlist";
import {
  PHASE_5H_FIXTURE_CREATE_PRECONDITIONS,
  PHASE_5H_FIXTURE_CREATE_SEMANTICS,
  PHASE_5H_FIXTURE_IDEMPOTENCY_KEY,
  evaluatePhase5HFixtureCreateGate,
} from "@/application/controlled-writes/pilot/Phase5HFixtureCreateSemantics";
import { buildPhase5HFixtureRollbackPlan } from "@/application/controlled-writes/pilot/Phase5HFixtureRollbackPlan";
import {
  SYNTHETIC_DRIVER_FIXTURE_REPO_REVIEW,
  SyntheticDriverFixtureRepository,
  createSyntheticDriverFixtureRepository,
} from "@/application/controlled-writes/pilot/Phase5HSyntheticDriverFixtureRepository";
import { runPhase5HFixtureCreateDryRun } from "@/application/controlled-writes/pilot/Phase5HFixtureDryRun";
import {
  isPhase5HCreateSyntheticDriverFixtureDryRunEnabled,
  isPhase5HCreateSyntheticDriverFixtureEnabled,
} from "@/application/controlled-writes/pilot/isPhase5HFixtureCreateEnabled";
import { classifyProvenSyntheticDriver } from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";
import { isTestOrNoncanonicalDriver } from "@/domain/driver/DriverDuplicateIdentityAudit";
import { classifyDriverMembership } from "@/domain/driver/DriverRoleClassification";
import { enumeratePhase5GTargetActionCandidates } from "@/application/controlled-writes/pilot/Phase5GPilotActionSafety";
import { buildPhase5GInventoryRecord } from "@/application/controlled-writes/pilot/Phase5GInventoryRecord";

describe("Phase 5H — enablement / write flags", () => {
  it("1. write flags remain false; controlled writes not activated", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION).toEqual({
      fixtureDomainWrites: 0,
      auditWrites: 0,
      idempotencyWrites: 0,
      triggerSideEffectWrites: 0,
      authWrites: 0,
      financeWrites: 0,
      tripWrites: 0,
    });
  });

  it("2. harness env exact 1 only; separate from Pilot flags", () => {
    expect(isPhase5HCreateSyntheticDriverFixtureDryRunEnabled(undefined)).toBe(
      false,
    );
    expect(isPhase5HCreateSyntheticDriverFixtureDryRunEnabled("0")).toBe(false);
    expect(isPhase5HCreateSyntheticDriverFixtureDryRunEnabled("true")).toBe(
      false,
    );
    expect(isPhase5HCreateSyntheticDriverFixtureDryRunEnabled("1")).toBe(true);
    expect(isPhase5HCreateSyntheticDriverFixtureEnabled("1")).toBe(true);
    expect(isPhase5HCreateSyntheticDriverFixtureEnabled("true")).toBe(false);
  });
});

describe("Phase 5H — document id + Auth dependency", () => {
  it("3. dedicated id uses test_ prefix strategy", () => {
    expect(PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID).toBe(
      "test_adminnext_phase5h_driver_pilot_001",
    );
    expect(PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID.startsWith("test_")).toBe(
      true,
    );
  });

  it("4. AUTH_REQUIRED_FOR_FIXTURE=true; Auth create forbidden; STOP", () => {
    expect(AUTH_REQUIRED_FOR_FIXTURE).toBe(true);
    expect(FIXTURE_CREATION_NO_GO).toBe(true);
    const a = assessAuthDependencyForFixture();
    expect(a.createFakeAuthUser).toBe("forbidden");
    expect(a.firestoreOnlyPreferred).toBe(true);
    expect(a.documentIdIsAuthUidByConvention).toBe(true);
    expect(a.documentIdMustBeUidShaped).toBe(false);
    expect(a.uncontrolledTriggers).toContain("syncUserClaimsOnWrite");
    expect(a.stopReason).toMatch(/STOP/);
  });
});

describe("Phase 5H — Cloud Functions trigger analysis", () => {
  it("5. syncUserClaimsOnWrite is uncontrolled Auth side effect on create", () => {
    const sync = PHASE_5H_USER_DOC_TRIGGER_ANALYSIS.find(
      (r) => r.exportName === "syncUserClaimsOnWrite",
    );
    expect(sync).toBeDefined();
    expect(sync!.firesOnUserDocCreate).toBe(true);
    expect(sync!.classification).toBe("uncontrolled");
    expect(sync!.authDependency).toBe(true);
    expect(sync!.financeDependency).toBe(false);
    expect(sync!.tripDependency).toBe(false);
  });

  it("6. registration notifications / wallet do not auto-fire on user create", () => {
    const notify = PHASE_5H_USER_DOC_TRIGGER_ANALYSIS.find(
      (r) => r.exportName === "notifyAdminsDriverApplication",
    );
    const wallet = PHASE_5H_USER_DOC_TRIGGER_ANALYSIS.find(
      (r) => r.exportName === "adminAdjustDriverWallet",
    );
    expect(notify!.firesOnUserDocCreate).toBe(false);
    expect(wallet!.firesOnUserDocCreate).toBe(false);
    expect(notify!.classification).toBe("none");
    expect(wallet!.classification).toBe("none");
  });
});

describe("Phase 5H — exact fixture schema", () => {
  it("7. required Legacy fields only: ismndob / pending_review / actev false / markers", () => {
    const d = PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC;
    expect(d.ismndob).toBe(true);
    expect(d.registration_status).toBe("pending_review");
    expect(d.actev_mndob).toBe(false);
    expect(d.is_test).toBe(true);
    expect(d.functional_test).toBe(true);
    expect(d.qa_fixture).toBe(true);
    expect(d.on_trip).toBe(false);
    expect(d.mndon_newacc).toBe(false);
  });

  it("8. forbidden PII / role / finance / Storage fields not on schema keys", () => {
    const keys = Object.keys(PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC);
    for (const f of PHASE_5H_FIXTURE_FORBIDDEN_FIELDS) {
      expect(keys).not.toContain(f);
    }
    expect(PHASE_5H_PII_POLICY.realPiiAllowed).toBe(false);
    expect(PHASE_5H_PII_POLICY.storageUploads).toBe("forbidden");
    expect(PHASE_5H_PII_POLICY.unavoidableSyntheticPlaceholders).toEqual([]);
  });
});

describe("Phase 5H — country/city + synthetic classification", () => {
  it("9. country/city from closed canonical maps → mapped/mapped", () => {
    const g = resolvePhase5HFixtureGeography();
    expect(g.countryId).toBe(PHASE_5H_FIXTURE_COUNTRY_ID);
    expect(g.cityId).toBe(PHASE_5H_FIXTURE_CITY_ID);
    expect(g.countryMapping).toBe("mapped");
    expect(g.cityMapping).toBe("mapped");
  });

  it("10. proven synthetic + testOrNoncanonical + operational Driver membership", () => {
    const id = PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID;
    const data = PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC as unknown as Record<
      string,
      unknown
    >;
    expect(classifyProvenSyntheticDriver({ documentId: id, data }).ok).toBe(
      true,
    );
    expect(
      isTestOrNoncanonicalDriver({
        documentId: id,
        data,
        countryId: PHASE_5H_FIXTURE_COUNTRY_ID,
      }),
    ).toBe(true);
    expect(classifyDriverMembership(data).isOperationalDriver).toBe(true);
    expect(data.Isagent).toBeUndefined();
    expect(data.IsAdmin).toBeUndefined();
  });
});

describe("Phase 5H — create allowlist + write counts", () => {
  it("11. typed create allowlist; no merge/overwrite; no arbitrary payload", () => {
    expect(assertCreateAllowlistTyped()).toBe(true);
    expect(PHASE_5H_FIXTURE_CREATE_ALLOWLIST.mode).toBe("create_only");
    expect(PHASE_5H_FIXTURE_CREATE_ALLOWLIST.merge).toBe(false);
    expect(PHASE_5H_FIXTURE_CREATE_ALLOWLIST.overwrite).toBe(false);
    expect(PHASE_5H_FIXTURE_CREATE_ALLOWLIST.arbitraryPayloadAllowed).toBe(
      false,
    );
    expect(PHASE_5H_FIXTURE_CREATE_ALLOWLIST.collection).toBe("user");
  });

  it("12. prep counts all 0; blocked future create 0; unblocked doc for awareness", () => {
    expect(PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION.fixtureDomainWrites).toBe(
      0,
    );
    expect(PHASE_5H_EXPECTED_WRITE_COUNTS_FUTURE_CREATE_BLOCKED.authWrites).toBe(
      0,
    );
    expect(
      PHASE_5H_EXPECTED_WRITE_COUNTS_FUTURE_CREATE_IF_UNBLOCKED
        .fixtureDomainWrites,
    ).toBe(1);
    expect(
      PHASE_5H_EXPECTED_WRITE_COUNTS_FUTURE_CREATE_IF_UNBLOCKED.financeWrites,
    ).toBe(0);
    expect(
      PHASE_5H_EXPECTED_WRITE_COUNTS_FUTURE_CREATE_IF_UNBLOCKED.tripWrites,
    ).toBe(0);
  });
});

describe("Phase 5H — create-only semantics + idempotency", () => {
  it("13. SKIP default; FIXTURE_CREATION_NO_GO when create flag=1", () => {
    const skip = evaluatePhase5HFixtureCreateGate({
      expectedProjectId: "tutorial-multi-language-70gx4j",
      writeFlagsAllFalse: true,
    });
    expect(skip.ok).toBe(false);
    if (!skip.ok) expect(skip.code).toBe("PHASE5H_FIXTURE_CREATE_SKIP");

    const blocked = evaluatePhase5HFixtureCreateGate({
      PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE: "1",
      projectId: "tutorial-multi-language-70gx4j",
      documentId: PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
      idempotencyKey: PHASE_5H_FIXTURE_IDEMPOTENCY_KEY,
      expectedProjectId: "tutorial-multi-language-70gx4j",
      writeFlagsAllFalse: true,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("FIXTURE_CREATION_NO_GO");
  });

  it("14. FIXTURE_ALREADY_EXISTS semantics documented; no apply to existing", () => {
    expect(PHASE_5H_FIXTURE_CREATE_SEMANTICS.onAlreadyExists).toBe(
      "FIXTURE_ALREADY_EXISTS",
    );
    expect(PHASE_5H_FIXTURE_CREATE_SEMANTICS.applyToExisting).toBe(false);
    expect(PHASE_5H_FIXTURE_CREATE_SEMANTICS.merge).toBe(false);
    expect(PHASE_5H_FIXTURE_CREATE_PRECONDITIONS.documentMustNotExist).toBe(
      true,
    );
    expect(PHASE_5H_FIXTURE_CREATE_PRECONDITIONS.authUserCreateForbidden).toBe(
      true,
    );
    expect(PHASE_5H_FIXTURE_IDEMPOTENCY_KEY).toBe(
      "phase5h_create_synthetic_driver_fixture_v1",
    );
  });
});

describe("Phase 5H — rollback + repository", () => {
  it("15. rollback A retain enabled; B deletion not implemented", () => {
    const plan = buildPhase5HFixtureRollbackPlan();
    expect(plan.strategyA_retain.enabled).toBe(true);
    expect(plan.strategyA_retain.retainMarkedSynthetic).toBe(true);
    expect(plan.strategyB_futureControlledDeletion.implemented).toBe(false);
    expect(plan.strategyB_futureControlledDeletion.destructiveDeleteNow).toBe(
      false,
    );
  });

  it("16. SyntheticDriverFixtureRepository create-only; hard-locked unreachable", () => {
    expect(SYNTHETIC_DRIVER_FIXTURE_REPO_REVIEW.activated).toBe(false);
    expect(SYNTHETIC_DRIVER_FIXTURE_REPO_REVIEW.createOnly).toBe(true);
    expect(SYNTHETIC_DRIVER_FIXTURE_REPO_REVIEW.applyToExisting).toBe(false);
    expect(SYNTHETIC_DRIVER_FIXTURE_REPO_REVIEW.adminUi).toBe(false);
    expect(
      SyntheticDriverFixtureRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
      }),
    ).toBe(false);
    const repo = createSyntheticDriverFixtureRepository();
    const plan = repo.planCreate();
    expect(plan.mode).toBe("create_only");
    expect(plan.AUTH_REQUIRED_FOR_FIXTURE).toBe(true);
    const created = repo.create(plan);
    expect(created.ok).toBe(false);
    expect(created.actualWrite).toBe(false);
    if (!created.ok) expect(created.code).toBe("FIXTURE_CREATION_NO_GO");
    expect(repo.applyToExisting().ok).toBe(false);
  });
});

describe("Phase 5H — dry-run + Pilot compatibility", () => {
  it("17. dry-run plans schema; actualWrite=0; blocked by NO-GO", () => {
    const r = runPhase5HFixtureCreateDryRun();
    expect(r.mode).toBe("dry_run");
    expect(r.actualWrite).toBe(false);
    expect(r.wouldWrite).toBe(false);
    expect(r.productionWrites).toBe(0);
    expect(r.authWrites).toBe(0);
    expect(r.financeWrites).toBe(0);
    expect(r.tripWrites).toBe(0);
    expect(r.writeFlagsRemainFalse).toBe(true);
    expect(r.createBlockedCode).toBe("FIXTURE_CREATION_NO_GO");
    expect(r.allowlistOk).toBe(true);
  });

  it("18. fixture passes 5F/5G Pilot compatibility (needs_changes path)", () => {
    const compat = assertPhase5HFixturePilotCompatibility();
    expect(compat.synthetic).toBe(true);
    expect(compat.operationalDriver).toBe(true);
    expect(compat.pending_review).toBe(true);
    expect(compat.safePilotEligible).toBe(true);
    expect(compat.plannedAction).toBe("needs_changes");
    expect(compat.phase5FEligible).toBe(true);
    expect(compat.phase5GSafePilotEligible).toBe(true);
  });

  it("19. 5G inventory ranks needs_changes SAFE for fixture snapshot", () => {
    const data = PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC as unknown as Record<
      string,
      unknown
    >;
    const row = buildPhase5GInventoryRecord({
      documentId: PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
      data,
    });
    expect(row).not.toBeNull();
    expect(row!.safePilotEligible).toBe(true);
    expect(row!.authDependency).toBe(false);
    const actions = enumeratePhase5GTargetActionCandidates(row!);
    const needs = actions.find((a) => a.action === "needs_changes");
    expect(needs).toBeDefined();
    expect(needs!.safetyRank).toBe("SAFE");
  });

  it("20. omitting on_trip would break idle / safePilot — schema keeps explicit false", () => {
    const broken = {
      ...PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC,
    } as unknown as Record<string, unknown>;
    delete broken.on_trip;
    delete broken.mndon_newacc;
    const row = buildPhase5GInventoryRecord({
      documentId: PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
      data: broken,
    });
    expect(row!.tripState).toBe("unknown");
    expect(row!.safePilotEligible).toBe(false);
  });
});

describe("Phase 5H — isolation guards", () => {
  it("21. dry-run auth assessment matches STOP posture", () => {
    const r = runPhase5HFixtureCreateDryRun();
    expect(r.authAssessment.AUTH_REQUIRED_FOR_FIXTURE).toBe(true);
    expect(r.authAssessment.FIXTURE_CREATION_NO_GO).toBe(true);
    expect(r.authAssessment.createFakeAuthUser).toBe("forbidden");
    expect(r.geography.countryMapping).toBe("mapped");
    expect(r.geography.cityMapping).toBe("mapped");
  });

  it("22. prep write-count zeros asserted; finance/trip isolation", () => {
    expect(PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION.financeWrites).toBe(0);
    expect(PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION.tripWrites).toBe(0);
    expect(PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION.authWrites).toBe(0);
    expect(
      PHASE_5H_EXPECTED_WRITE_COUNTS_FUTURE_CREATE_IF_UNBLOCKED
        .triggerSideEffectWrites,
    ).toBe(1);
    expect(PHASE_5H_FIXTURE_CREATE_PRECONDITIONS.financeForbidden).toBe(true);
    expect(PHASE_5H_FIXTURE_CREATE_PRECONDITIONS.tripForbidden).toBe(true);
    expect(PHASE_5H_FIXTURE_CREATE_PRECONDITIONS.pilotFlagsSeparate).toBe(true);
  });
});
