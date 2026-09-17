/**
 * Phase 5F — offline unit contracts:
 * eligibility / selection / diff / guards / dry-run wouldWrite without Production.
 * Production writes = 0. No live Firebase.
 */
import { describe, expect, it } from "vitest";
import {
  classifyProvenSyntheticDriver,
  PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET,
} from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";
import { evaluateSyntheticPilotTargetEligibility } from "@/application/controlled-writes/pilot/Phase5FSyntheticTargetEligibility";
import {
  discoverSyntheticPilotTarget,
  isPlannedSyntheticIdValidOnlyIfDiscovered,
} from "@/application/controlled-writes/pilot/Phase5FSyntheticTargetDiscovery";
import {
  discoverSyntheticPilotTargetFromShadowDocs,
  summarizeDiscoverySafe,
} from "@/application/controlled-writes/pilot/Phase5FShadowDiscovery";
import {
  PHASE_5F_REQUIRED_WRITE_FLAGS_FALSE,
  capturePreconditionMeta,
  phase5FDryRunPassGatesMet,
  planPhase5FAuditMetadata,
  planPhase5FIdempotencyKey,
  runPhase5FDriverPilotDryRun,
} from "@/application/controlled-writes/pilot/Phase5FDriverPilotDryRun";
import {
  isPhase5FDriverPilotDryRunEnabled,
  isPhase5FLiveDiscoveryEnabled,
} from "@/application/controlled-writes/pilot/isPhase5FDriverPilotDryRunEnabled";
import {
  AUTH_REQUIRED_FOR_PILOT_TARGET,
  PHASE_5E_EXPECTED_PROJECT_ID,
} from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";
import {
  assertFirestorePatchAllowlisted,
  buildNeedsChangesAllowlistedPatch,
  evaluatePilotDomainDiff,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotDiffContract";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  ProductionDriverWriteRepository,
  createProductionRuntimeDriverWriteRepository,
} from "@/application/controlled-writes/drivers/DriverWriteRepository";

/** Minimal safe synthetic operational Driver fixture (no PII). */
function safeSyntheticPendingDriver(
  documentId: string,
  overrides: Record<string, unknown> = {},
): { documentId: string; data: Record<string, unknown> } {
  return {
    documentId,
    data: {
      ismndob: true,
      registration_status: "pending_review",
      actev_mndob: false,
      is_test: true,
      functional_test: true,
      Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
      mndob_vill: { path: "villages/riyadh", id: "riyadh" },
      on_trip: false,
      mndon_newacc: false,
      ...overrides,
    },
  };
}

describe("Phase 5F — enablement posture unchanged", () => {
  it("write flags / enablement remain false; Production unreachable", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(PHASE_5F_REQUIRED_WRITE_FLAGS_FALSE.DRIVER_WRITE_ENABLED).toBe(
      false,
    );
    expect(PHASE_5F_REQUIRED_WRITE_FLAGS_FALSE.FINANCE_WRITE_ENABLED).toBe(
      false,
    );
    expect(
      ProductionDriverWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
      }),
    ).toBe(false);
    expect(createProductionRuntimeDriverWriteRepository().kind).toBe(
      "production_driver_write",
    );
    expect(AUTH_REQUIRED_FOR_PILOT_TARGET).toBe(false);
  });
});

describe("Phase 5F — proven synthetic classification (no fuzzy names)", () => {
  it("accepts id prefix and boolean markers", () => {
    const r = classifyProvenSyntheticDriver({
      documentId: "test_phase5f_safe_001",
      data: { is_test: true, functional_test: true },
    });
    expect(r.ok).toBe(true);
    expect(r.fuzzyNameMatchingUsed).toBe(false);
    expect(r.markersMatched).toContain("documentId_prefix");
    expect(r.markersMatched).toContain("is_test");
  });

  it("rejects fuzzy display_name alone", () => {
    const r = classifyProvenSyntheticDriver({
      documentId: "realLookingUidAbc123XYZ",
      data: {
        display_name: "functional test driver",
        email: "foo@touri-taxi-test.example",
      },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("NOT_PROVEN_SYNTHETIC");
    expect(r.fuzzyNameMatchingUsed).toBe(false);
  });
});

describe("Phase 5F — eligibility rules", () => {
  it("passes for operational synthetic pending_review idle driver", () => {
    const c = safeSyntheticPendingDriver("test_phase5f_eligible_a");
    const r = evaluateSyntheticPilotTargetEligibility(c);
    expect(r.eligible).toBe(true);
    expect(r.facts.operationalDriver).toBe(true);
    expect(r.facts.synthetic).toBe(true);
    expect(r.facts.currentState).toBe("pending_review");
    expect(r.facts.activeTrip).toBe(false);
    expect(r.facts.financeImpact).toBe("none");
    expect(r.facts.actevMndob).toBe(false);
  });

  it("denies active trip", () => {
    const c = safeSyntheticPendingDriver("test_phase5f_busy", {
      on_trip: true,
    });
    const r = evaluateSyntheticPilotTargetEligibility(c);
    expect(r.eligible).toBe(false);
    expect(r.denials).toContain("DRIVER_HAS_ACTIVE_TRIP");
  });

  it("denies finance impact (outstanding)", () => {
    const c = safeSyntheticPendingDriver("test_phase5f_fin", {
      Outstandingonlinepayment: 12.5,
    });
    const r = evaluateSyntheticPilotTargetEligibility(c);
    expect(r.eligible).toBe(false);
    expect(r.denials).toContain("FINANCE_IMPACT_PRESENT");
  });

  it("denies agent / admin roles", () => {
    const agent = evaluateSyntheticPilotTargetEligibility(
      safeSyntheticPendingDriver("test_phase5f_agent", { Isagent: true }),
    );
    expect(agent.denials).toContain("AGENT_ROLE_PRESENT");

    const admin = evaluateSyntheticPilotTargetEligibility(
      safeSyntheticPendingDriver("test_phase5f_admin", { IsAdmin: true }),
    );
    expect(admin.denials).toContain("ADMIN_ROLE_PRESENT");
    expect(admin.denials).toContain("NOT_OPERATIONAL_DRIVER");
  });

  it("denies non-pending_review and actev_mndob≠false", () => {
    const approved = evaluateSyntheticPilotTargetEligibility(
      safeSyntheticPendingDriver("test_phase5f_approved", {
        registration_status: "approved",
      }),
    );
    expect(approved.denials).toContain("REGISTRATION_STATUS_MISMATCH");

    const actev = evaluateSyntheticPilotTargetEligibility(
      safeSyntheticPendingDriver("test_phase5f_actev", { actev_mndob: true }),
    );
    expect(actev.denials).toContain("ACTEV_MNDOB_NOT_FALSE");
  });

  it("denies missing country / city", () => {
    const noCountry = evaluateSyntheticPilotTargetEligibility(
      safeSyntheticPendingDriver("test_phase5f_nogeo", {
        Rev_dolh: null,
        mndob_vill: null,
      }),
    );
    expect(noCountry.denials).toContain("COUNTRY_NOT_REPRESENTED");
    expect(noCountry.denials).toContain("CITY_NOT_REPRESENTED");
  });
});

describe("Phase 5F — discovery selection", () => {
  it("zero eligible → NO_SAFE_SYNTHETIC_DRIVER_EXISTS; no planned-id fallback", () => {
    const discovery = discoverSyntheticPilotTarget([
      {
        documentId: "realUserUidNotSynthetic",
        data: {
          ismndob: true,
          registration_status: "pending_review",
          actev_mndob: false,
        },
      },
    ]);
    expect(discovery.targetFound).toBe(false);
    if (!discovery.targetFound) {
      expect(discovery.reason).toBe("NO_SAFE_SYNTHETIC_DRIVER_EXISTS");
      expect(discovery.dryRunStatus).toBe("NO_GO");
      expect(discovery.plannedIdUsedAsFallback).toBe(false);
    }
    expect(
      isPlannedSyntheticIdValidOnlyIfDiscovered(discovery),
    ).toBe(false);
  });

  it("multiple eligible → deterministic documentId order", () => {
    const discovery = discoverSyntheticPilotTarget([
      safeSyntheticPendingDriver("test_phase5f_zulu"),
      safeSyntheticPendingDriver("test_phase5f_alpha"),
      safeSyntheticPendingDriver("test_phase5f_mike"),
    ]);
    expect(discovery.targetFound).toBe(true);
    if (discovery.targetFound) {
      expect(discovery.targetId).toBe("test_phase5f_alpha");
      expect(discovery.eligibleIdsOrdered).toEqual([
        "test_phase5f_alpha",
        "test_phase5f_mike",
        "test_phase5f_zulu",
      ]);
      expect(discovery.eligibleCount).toBe(3);
    }
  });

  it("planned strategy id invalid unless discovered+eligible", () => {
    const without = discoverSyntheticPilotTarget([
      safeSyntheticPendingDriver("test_phase5f_other"),
    ]);
    expect(
      isPlannedSyntheticIdValidOnlyIfDiscovered(
        without,
        PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET,
      ),
    ).toBe(false);

    const withPlanned = discoverSyntheticPilotTarget([
      safeSyntheticPendingDriver(PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET),
    ]);
    expect(
      isPlannedSyntheticIdValidOnlyIfDiscovered(withPlanned),
    ).toBe(true);
  });

  it("shadow discovery filters non-synthetic before eligibility", () => {
    const discovery = discoverSyntheticPilotTargetFromShadowDocs([
      {
        id: "realUserUidAbc",
        data: {
          ismndob: true,
          registration_status: "pending_review",
          actev_mndob: false,
          display_name: "functional test",
        },
      },
      {
        id: "test_phase5f_shadow_ok",
        data: {
          ismndob: true,
          registration_status: "pending_review",
          actev_mndob: false,
          is_test: true,
          functional_test: true,
          Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
          mndob_vill: { path: "villages/riyadh", id: "riyadh" },
          on_trip: false,
        },
      },
    ]);
    const safe = summarizeDiscoverySafe(discovery);
    expect(safe.targetFound).toBe(true);
    expect(safe.targetId).toBe("test_phase5f_shadow_ok");
    expect(safe.reason).toBeNull();
    expect(JSON.stringify(safe)).not.toMatch(/display_name|email|phone/i);
  });
});

describe("Phase 5F — allowed diff + guards", () => {
  it("needs_changes patch is registration_status only", () => {
    const patch = buildNeedsChangesAllowlistedPatch();
    expect(assertFirestorePatchAllowlisted(patch).ok).toBe(true);
    expect(
      assertFirestorePatchAllowlisted({
        registration_status: "needs_changes",
        actev_mndob: false,
      }).ok,
    ).toBe(false);
  });

  it("domain diff allows registrationStatus + preconditionToken only", () => {
    const okDiff = evaluatePilotDomainDiff({
      before: {
        registrationStatus: "pending_review",
        preconditionToken: "tok_a",
        tripState: "idle",
      },
      after: {
        registrationStatus: "needs_changes",
        preconditionToken: "tok_b",
        tripState: "idle",
      },
    });
    expect(okDiff.ok).toBe(true);
  });
});

describe("Phase 5F — dry-run wouldWrite without Production", () => {
  it("env helpers: exact 1 only; live discovery default false", () => {
    expect(
      isPhase5FDriverPilotDryRunEnabled({
        PHASE5F_DRIVER_PILOT_DRY_RUN: undefined,
        PHASE5E_DRIVER_PILOT_DRY_RUN: undefined,
      }),
    ).toBe(false);
    expect(
      isPhase5FDriverPilotDryRunEnabled({
        PHASE5E_DRIVER_PILOT_DRY_RUN: "1",
      }),
    ).toBe(true);
    expect(
      isPhase5FDriverPilotDryRunEnabled({
        PHASE5F_DRIVER_PILOT_DRY_RUN: "1",
      }),
    ).toBe(true);
    expect(isPhase5FLiveDiscoveryEnabled(undefined)).toBe(false);
    expect(isPhase5FLiveDiscoveryEnabled("1")).toBe(true);
  });

  it("DRY_RUN_PASS when target found + gates met; apply count=0", () => {
    const discovery = discoverSyntheticPilotTarget([
      safeSyntheticPendingDriver("test_phase5f_dry_pass"),
    ]);
    const result = runPhase5FDriverPilotDryRun({
      projectId: PHASE_5E_EXPECTED_PROJECT_ID,
      actorRole: "super_admin",
      operatorIdentity: "op_super_5f",
      discovery,
      preconditionToken: "tok_live_captured_opaque",
    });
    expect(result.ok).toBe(true);
    expect(result.pilotStatus).toBe("DRY_RUN_PASS");
    expect(result.wouldWrite).toBe(true);
    expect(result.actualWrite).toBe(false);
    expect(result.productionApplyInvocationCount).toBe(0);
    expect(result.writeFlagsRemainFalse).toBe(true);
    expect(result.observability.totalProductionWrites).toBe(0);
    expect(result.observability.domainWrites).toBe(0);
    expect(result.observability.auditWrites).toBe(0);
    expect(result.observability.idempotencyWrites).toBe(0);
    expect(result.observability.authWrites).toBe(0);
    expect(result.observability.financeWrites).toBe(0);
    expect(result.observability.tripWrites).toBe(0);
    expect(result.observability.auditIntentPlanned).toBe(true);
    expect(result.observability.auditResultPlanned).toBe(true);
    expect(result.observability.idempotencyPlanned).toBe(true);
    expect(result.observability.preconditionCaptured).toBe(true);
    expect(JSON.stringify(result.observability)).not.toMatch(
      /tok_live_captured_opaque/,
    );
    expect(phase5FDryRunPassGatesMet(result.observability)).toBe(true);
  });

  it("NO_GO when no safe synthetic target — never falls back to planned id", () => {
    const discovery = discoverSyntheticPilotTarget([]);
    const result = runPhase5FDriverPilotDryRun({
      projectId: PHASE_5E_EXPECTED_PROJECT_ID,
      actorRole: "super_admin",
      operatorIdentity: "op_super_5f",
      discovery,
      preconditionToken: "tok_x",
    });
    expect(result.ok).toBe(false);
    expect(result.pilotStatus).toBe("DRY_RUN_NO_GO");
    expect(result.wouldWrite).toBe(false);
    expect(result.actualWrite).toBe(false);
    expect(result.observability.denials).toContain(
      "NO_SAFE_SYNTHETIC_DRIVER_EXISTS",
    );
    expect(result.observability.targetId).toBeNull();
  });

  it("NO_GO when write flags flipped true", () => {
    const discovery = discoverSyntheticPilotTarget([
      safeSyntheticPendingDriver("test_phase5f_flags"),
    ]);
    const result = runPhase5FDriverPilotDryRun({
      projectId: PHASE_5E_EXPECTED_PROJECT_ID,
      actorRole: "super_admin",
      operatorIdentity: "op_super_5f",
      discovery,
      preconditionToken: "tok_y",
      writeFlags: {
        ...PHASE_5F_REQUIRED_WRITE_FLAGS_FALSE,
        DRIVER_WRITE_ENABLED: true,
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
      },
    });
    expect(result.pilotStatus).toBe("DRY_RUN_NO_GO");
    expect(result.observability.denials).toContain(
      "WRITE_FLAGS_MUST_REMAIN_FALSE",
    );
  });

  it("precondition / audit / idempotency plan only (writes=0)", () => {
    expect(capturePreconditionMeta(undefined).preconditionCaptured).toBe(
      false,
    );
    expect(capturePreconditionMeta("tok").preconditionCaptured).toBe(true);
    const audit = planPhase5FAuditMetadata({
      action: "needs_changes",
      targetId: "test_phase5f_a",
      actorRole: "super_admin",
    });
    expect(audit.auditIntentPlanned).toBe(true);
    expect(audit.auditResultPlanned).toBe(true);
    expect(audit.auditWrites).toBe(0);
    const idem = planPhase5FIdempotencyKey({
      pilotDriverId: "test_phase5f_a",
      operatorUid: "op1",
      utcDate: "20260912",
      nonce: "n1",
    });
    expect(idem.planned).toBe(true);
    expect(idem.writes).toBe(0);
  });
});
