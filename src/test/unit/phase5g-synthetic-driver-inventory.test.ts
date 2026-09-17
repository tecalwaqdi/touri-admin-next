/**
 * Phase 5G — offline unit contracts:
 * classification / eligibility / ranking / selection without Production.
 * Production writes = 0. No live Firebase.
 */
import { describe, expect, it } from "vitest";
import { classifyPhase5GSyntheticEvidence } from "@/application/controlled-writes/pilot/Phase5GSyntheticEvidence";
import { classifyPhase5GFinanceSafety } from "@/application/controlled-writes/pilot/Phase5GFinanceSafetyClassification";
import { buildPhase5GInventoryRecord } from "@/application/controlled-writes/pilot/Phase5GInventoryRecord";
import {
  comparePhase5GTargetActionCandidates,
  enumeratePhase5GTargetActionCandidates,
  PHASE_5G_ACTION_PREFERENCE,
} from "@/application/controlled-writes/pilot/Phase5GPilotActionSafety";
import { runPhase5GSyntheticDriverInventory } from "@/application/controlled-writes/pilot/Phase5GSyntheticDriverInventory";
import {
  assertPhase5GWriteFlagsFalse,
  PHASE_5G_REQUIRED_WRITE_FLAGS_FALSE,
  summarizePhase5GInventorySafe,
} from "@/application/controlled-writes/pilot/Phase5GInventoryObservability";
import { isPhase5GLiveSyntheticDriverInventoryEnabled } from "@/application/controlled-writes/pilot/isPhase5GLiveInventoryEnabled";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  ProductionDriverWriteRepository,
  createProductionRuntimeDriverWriteRepository,
} from "@/application/controlled-writes/drivers/DriverWriteRepository";

function synthDoc(
  documentId: string,
  overrides: Record<string, unknown> = {},
): { id: string; data: Record<string, unknown> } {
  return {
    id: documentId,
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

describe("Phase 5G — enablement / write flags", () => {
  it("write flags remain false; Production write unreachable", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(assertPhase5GWriteFlagsFalse()).toBe(true);
    expect(PHASE_5G_REQUIRED_WRITE_FLAGS_FALSE.FINANCE_WRITE_ENABLED).toBe(
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
  });

  it("live inventory env exact 1 only", () => {
    expect(isPhase5GLiveSyntheticDriverInventoryEnabled(undefined)).toBe(false);
    expect(isPhase5GLiveSyntheticDriverInventoryEnabled("0")).toBe(false);
    expect(isPhase5GLiveSyntheticDriverInventoryEnabled("true")).toBe(false);
    expect(isPhase5GLiveSyntheticDriverInventoryEnabled("1")).toBe(true);
  });
});

describe("Phase 5G — proven synthetic classification (no fuzzy)", () => {
  it("accepts id prefix and boolean markers", () => {
    const r = classifyPhase5GSyntheticEvidence({
      documentId: "test_phase5g_safe_001",
      data: { is_test: true },
    });
    expect(r.ok).toBe(true);
    expect(r.fuzzyNameMatchingUsed).toBe(false);
    expect(r.syntheticEvidenceKind).toBe("documentId_prefix");
    expect(r.excludedUnknownIdentityReclassified).toBe(false);
  });

  it("rejects fuzzy display_name / email alone", () => {
    const r = classifyPhase5GSyntheticEvidence({
      documentId: "realLookingUidAbc123XYZ",
      data: {
        display_name: "functional test driver",
        email: "foo@touri-taxi-test.example",
      },
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("NOT_PROVEN_SYNTHETIC");
  });

  it("never reclassifies excludedUnknownIdentity", () => {
    const r = classifyPhase5GSyntheticEvidence({
      documentId: "test_would_look_synthetic",
      data: { is_test: true },
      mappingStatus: "excludedUnknownIdentity",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("EXCLUDED_UNKNOWN_IDENTITY_FORBIDDEN");
    expect(r.excludedUnknownIdentityReclassified).toBe(false);
  });
});

describe("Phase 5G — finance safety", () => {
  it("none when no outstanding/bank", () => {
    const f = classifyPhase5GFinanceSafety({});
    expect(f.financeImpactClassification).toBe("none");
    expect(f.pendingSettlement).toBe(false);
    expect(f.walletImpact).toBe("none");
  });

  it("present when outstanding", () => {
    const f = classifyPhase5GFinanceSafety({
      Outstandingonlinepayment: 5,
    });
    expect(f.financeImpactClassification).toBe("present");
    expect(f.pendingSettlement).toBe(true);
  });
});

describe("Phase 5G — inventory record eligibility", () => {
  it("eligible pending_review idle synthetic", () => {
    const doc = synthDoc("test_phase5g_eligible");
    const row = buildPhase5GInventoryRecord({
      documentId: doc.id,
      data: doc.data,
    });
    expect(row).not.toBeNull();
    expect(row!.safePilotEligible).toBe(true);
    expect(row!.registrationStatus).toBe("pending_review");
    expect(row!.hasActiveTrip).toBe(false);
    expect(row!.financeImpactClassification).toBe("none");
    expect(row!.authDependency).toBe(false);
  });

  it("ineligible when trip busy", () => {
    const doc = synthDoc("test_phase5g_busy", { on_trip: true });
    const row = buildPhase5GInventoryRecord({
      documentId: doc.id,
      data: doc.data,
    });
    expect(row!.safePilotEligible).toBe(false);
    expect(row!.safePilotReasons).toContain("HAS_ACTIVE_TRIP");
  });

  it("ineligible when country missing", () => {
    const doc = synthDoc("test_phase5g_nogeo", { Rev_dolh: null });
    const row = buildPhase5GInventoryRecord({
      documentId: doc.id,
      data: doc.data,
    });
    expect(row!.safePilotEligible).toBe(false);
    expect(row!.countryMapping).toBe("missing");
  });

  it("returns null for non-synthetic", () => {
    const row = buildPhase5GInventoryRecord({
      documentId: "ordinaryDriverUid",
      data: { ismndob: true, registration_status: "pending_review" },
    });
    expect(row).toBeNull();
  });

  it("returns null for excludedUnknownIdentity even with markers", () => {
    const row = buildPhase5GInventoryRecord({
      documentId: "test_excluded_unk",
      data: { is_test: true, ismndob: true },
      mappingStatus: "excludedUnknownIdentity",
    });
    expect(row).toBeNull();
  });
});

describe("Phase 5G — action ranking / selection", () => {
  it("pending_review prefers needs_changes as SAFE", () => {
    const doc = synthDoc("test_phase5g_nc");
    const row = buildPhase5GInventoryRecord({
      documentId: doc.id,
      data: doc.data,
    })!;
    const candidates = enumeratePhase5GTargetActionCandidates(row);
    expect(candidates.map((c) => c.action)).toEqual([
      "needs_changes",
      "reject",
      "approve",
    ]);
    expect(candidates.find((c) => c.action === "needs_changes")!.safetyRank).toBe(
      "SAFE",
    );
    expect(candidates.find((c) => c.action === "reject")!.safetyRank).toBe(
      "ACCEPTABLE_WITH_CAUTION",
    );
    expect(candidates.find((c) => c.action === "approve")!.safetyRank).toBe(
      "ACCEPTABLE_WITH_CAUTION",
    );
  });

  it("approved only enumerates suspend", () => {
    const doc = synthDoc("test_phase5g_approved", {
      registration_status: "approved",
      actev_mndob: true,
    });
    const row = buildPhase5GInventoryRecord({
      documentId: doc.id,
      data: doc.data,
    })!;
    const candidates = enumeratePhase5GTargetActionCandidates(row);
    expect(candidates.map((c) => c.action)).toEqual(["suspend"]);
    expect(candidates[0]!.safetyRank).toBe("ACCEPTABLE_WITH_CAUTION");
  });

  it("needs_changes state has no admin Pilot action", () => {
    const doc = synthDoc("test_phase5g_nc_state", {
      registration_status: "needs_changes",
    });
    const row = buildPhase5GInventoryRecord({
      documentId: doc.id,
      data: doc.data,
    })!;
    expect(enumeratePhase5GTargetActionCandidates(row)).toEqual([]);
  });

  it("selection picks SAFE needs_changes over caution approve/reject", () => {
    const result = runPhase5GSyntheticDriverInventory([
      synthDoc("test_phase5g_z_approve_only", {
        registration_status: "approved",
        actev_mndob: true,
      }),
      synthDoc("test_phase5g_a_pending"),
      synthDoc("test_phase5g_b_pending"),
    ]);
    expect(result.syntheticDriversFound).toBe(3);
    expect(result.safePilotCandidates.length).toBeGreaterThanOrEqual(1);
    expect(result.recommendedExistingPilot).not.toBeNull();
    expect(result.recommendedExistingPilot!.action).toBe("needs_changes");
    expect(result.recommendedExistingPilot!.driverId).toBe(
      "test_phase5g_a_pending",
    );
    expect(result.recommendation).toBe("USE_EXISTING_SYNTHETIC_PILOT");
    expect(result.createFixture).toBe(false);
  });

  it("no SAFE → PREPARE_DEDICATED (do not create)", () => {
    const result = runPhase5GSyntheticDriverInventory([
      synthDoc("test_phase5g_only_approved", {
        registration_status: "approved",
        actev_mndob: true,
      }),
      synthDoc("test_phase5g_only_nc", {
        registration_status: "needs_changes",
      }),
    ]);
    expect(result.syntheticDriversFound).toBe(2);
    expect(result.safePilotCandidates).toEqual([]);
    expect(result.recommendedExistingPilot).toBeNull();
    expect(result.recommendation).toBe(
      "PREPARE_DEDICATED_SYNTHETIC_PRODUCTION_FIXTURE",
    );
    expect(result.createFixture).toBe(false);
    expect(result.stateDistribution.approved).toBe(1);
    expect(result.stateDistribution.needs_changes).toBe(1);
  });

  it("empty inventory → dedicated fixture recommendation", () => {
    const result = runPhase5GSyntheticDriverInventory([
      { id: "realDriver", data: { ismndob: true } },
    ]);
    expect(result.syntheticDriversFound).toBe(0);
    expect(result.recommendation).toBe(
      "PREPARE_DEDICATED_SYNTHETIC_PRODUCTION_FIXTURE",
    );
  });

  it("skips excludedUnknownIdentity docs", () => {
    const result = runPhase5GSyntheticDriverInventory([
      {
        id: "test_excluded_seven_shape",
        data: { is_test: true, ismndob: true },
        mappingStatus: "excludedUnknownIdentity",
      },
    ]);
    expect(result.syntheticDriversFound).toBe(0);
  });

  it("comparator prefers SAFE low-blast needs_changes then documentId", () => {
    const a = enumeratePhase5GTargetActionCandidates(
      buildPhase5GInventoryRecord({
        documentId: "test_b",
        data: synthDoc("test_b").data,
      })!,
    ).find((c) => c.action === "needs_changes")!;
    const b = enumeratePhase5GTargetActionCandidates(
      buildPhase5GInventoryRecord({
        documentId: "test_a",
        data: synthDoc("test_a").data,
      })!,
    ).find((c) => c.action === "needs_changes")!;
    expect(comparePhase5GTargetActionCandidates(b, a)).toBeLessThan(0);
    expect(PHASE_5G_ACTION_PREFERENCE[0]).toBe("needs_changes");
  });
});

describe("Phase 5G — observability", () => {
  it("summarizes NO_SAFE_EXISTING_PILOT without PII fields", () => {
    const result = runPhase5GSyntheticDriverInventory([]);
    const obs = summarizePhase5GInventorySafe(result, {
      productionReadCompleted: false,
    });
    expect(obs.overallStatus).toBe("NO_SAFE_EXISTING_PILOT");
    expect(obs.productionWrites).toBe(0);
    expect(obs.authWrites).toBe(0);
    expect(obs.financeWrites).toBe(0);
    expect(obs.tripWrites).toBe(0);
    expect(obs.allWriteFlagsFalseAfterRun).toBe(true);
    expect(obs.createFixture).toBe(false);
    expect(JSON.stringify(obs)).not.toMatch(/email|phone|iban/i);
  });

  it("PENDING_OPERATOR when result null", () => {
    const obs = summarizePhase5GInventorySafe(null, {
      productionReadCompleted: false,
      overallOverride: "PENDING_OPERATOR",
    });
    expect(obs.overallStatus).toBe("PENDING_OPERATOR");
  });
});
