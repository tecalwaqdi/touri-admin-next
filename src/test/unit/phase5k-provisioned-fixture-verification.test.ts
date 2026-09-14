/**
 * Phase 5K — offline unit tests for provisioned fixture verification logic/gates.
 * Production / Auth / Finance / Trip writes = 0.
 */
import { describe, expect, it } from "vitest";
import { isPhase5KVerifyProvisionedDriverFixtureEnabled } from "@/application/controlled-writes/pilot/isPhase5KVerifyProvisionedDriverFixtureEnabled";
import { explainPhase5JClaimVerificationReadCountZero } from "@/application/controlled-writes/pilot/Phase5KClaimVerificationExplanation";
import { verifyPhase5KAuthUser } from "@/application/controlled-writes/pilot/Phase5KAuthVerification";
import { verifyPhase5KFirestoreFixture } from "@/application/controlled-writes/pilot/Phase5KFirestoreVerification";
import { verifyPhase5KFinanceAndTrip } from "@/application/controlled-writes/pilot/Phase5KFinanceTripVerification";
import { evaluatePhase5KPilotCompatibility } from "@/application/controlled-writes/pilot/Phase5KPilotCompatibilityCheck";
import { createPhase5KFakeReadOnlyPorts } from "@/application/controlled-writes/pilot/Phase5KFakePorts";
import { runPhase5KVerifyProvisionedFixture } from "@/application/controlled-writes/pilot/Phase5KVerifyProvisionedFixture";
import {
  evaluatePhase5KPassConditions,
  emptyPhase5KVerificationSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5KVerificationSafeSummary";
import { PHASE_5I_EXPECTED_CUSTOM_CLAIMS } from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";
import { PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import { PHASE_5I_LOGICAL_FIXTURE_NAME } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
  OPERATOR_HARNESS_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";

describe("Phase 5K — gate exact-1", () => {
  it("flag absent / 0 / true → SKIP disabled", () => {
    expect(isPhase5KVerifyProvisionedDriverFixtureEnabled(undefined)).toBe(
      false,
    );
    expect(isPhase5KVerifyProvisionedDriverFixtureEnabled("")).toBe(false);
    expect(isPhase5KVerifyProvisionedDriverFixtureEnabled("0")).toBe(false);
    expect(isPhase5KVerifyProvisionedDriverFixtureEnabled("true")).toBe(false);
  });

  it("flag 1 → armed", () => {
    expect(isPhase5KVerifyProvisionedDriverFixtureEnabled("1")).toBe(true);
  });
});

describe("Phase 5K — Phase 5J claimVerificationReadCount=0 explanation", () => {
  it("classifies as observability wiring gap, not automatic bug", () => {
    const e = explainPhase5JClaimVerificationReadCountZero({
      phase5jOverallStatus: "PILOT_READY",
      phase5jPilotReady: true,
      phase5jClaimWrites: 1,
      phase5jClaimVerificationReadCount: 0,
    });
    expect(e.isAutomaticBug).toBe(false);
    expect(e.rootCause).toBe("OBSERVABILITY_COUNTER_NOT_WIRED");
    expect(e.claimsWereVerifiedDuringProvision).toBe(true);
    expect(e.summary).toMatch(/observability/i);
  });
});

describe("Phase 5K — Auth / Firestore / finance / pilot checks", () => {
  it("Auth expects disabled + country_id claims only", () => {
    const r = verifyPhase5KAuthUser(
      {
        uid: "u1",
        disabled: true,
        email: null,
        phoneNumber: null,
        customClaims: { ...PHASE_5I_EXPECTED_CUSTOM_CLAIMS },
        providerDataCount: 0,
      },
      1,
    );
    expect(r.authUserFound).toBe(true);
    expect(r.expectedClaimsMatch).toBe(true);
    expect(r.elevatedClaimsFound).toBe(false);
    expect(r.denials).toEqual([]);
  });

  it("elevated claims fail", () => {
    const r = verifyPhase5KAuthUser(
      {
        uid: "u1",
        disabled: true,
        email: null,
        phoneNumber: null,
        customClaims: {
          country_id: "countries/saudi_arabia",
          super_admin: true,
        },
        providerDataCount: 0,
      },
      1,
    );
    expect(r.elevatedClaimsFound).toBe(true);
    expect(r.expectedClaimsMatch).toBe(false);
  });

  it("Firestore expected fields + geo", () => {
    const r = verifyPhase5KFirestoreFixture(
      PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
        string,
        unknown
      >,
    );
    expect(r.firestoreFixtureFound).toBe(true);
    expect(r.countryMapped).toBe(true);
    expect(r.cityMapped).toBe(true);
    expect(r.noPii).toBe(true);
    expect(r.denials).toEqual([]);
  });

  it("finance none + no active trip", () => {
    const r = verifyPhase5KFinanceAndTrip(
      PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
        string,
        unknown
      >,
    );
    expect(r.financialImpact).toBe("none");
    expect(r.pendingSettlement).toBe(false);
    expect(r.walletMutationRequired).toBe(false);
    expect(r.hasActiveTrip).toBe(false);
  });

  it("finance unknown bank fields classified explicitly", () => {
    const r = verifyPhase5KFinanceAndTrip({
      ...(PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
        string,
        unknown
      >),
      ipanBank: "SA000",
    });
    expect(r.financialImpact).toBe("present");
    expect(r.walletMutationRequired).toBe("unknown");
    expect(r.denials.length).toBeGreaterThan(0);
  });

  it("Pilot needs_changes compatibility without apply", () => {
    const r = evaluatePhase5KPilotCompatibility({
      driverId: "drv1",
      registrationStatus: "pending_review",
      operationalDriver: true,
      hasActiveTrip: false,
      countryId: "saudi_arabia",
      preconditionToken: "tok_1",
    });
    expect(r.rbacPass).toBe(true);
    expect(r.scopePass).toBe(true);
    expect(r.transitionAllowed).toBe(true);
    expect(r.preconditionAvailable).toBe(true);
    expect(r.commandConstructed).toBe(true);
    expect(r.preconditionsPass).toBe(true);
    expect(r.allWriteFlagsFalse).toBe(true);
    expect(r.productionApplyReachable).toBe(false);
    expect(
      ProductionDriverWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
      }),
    ).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
  });
});

describe("Phase 5K — orchestrator offline", () => {
  it("unarmed → SKIPPED; writes 0", async () => {
    const r = await runPhase5KVerifyProvisionedFixture({ harnessArmed: false });
    expect(r.summary.overallStatus).toBe("SKIPPED");
    expect(r.summary.productionWrites).toBe(0);
    expect(r.summary.authWrites).toBe(0);
    expect(r.summary.pilotDryRunEligible).toBe(false);
  });

  it("armed + fake ports + registry override → VERIFIED", async () => {
    const ports = createPhase5KFakeReadOnlyPorts();
    const r = await runPhase5KVerifyProvisionedFixture({
      harnessArmed: true,
      ports,
      registryOverride: {
        ok: true,
        uid: "phase5k_offline_auth_shaped_uid_001",
        logicalFixtureNameMatch: true,
        provisioningStatusMatch: true,
        status: "pilot_ready",
        registryPath: "/tmp/fake-registry.json",
      },
    });
    expect(r.summary.overallStatus).toBe("PHASE5K_FIXTURE_VERIFIED");
    expect(r.summary.pilotDryRunEligible).toBe(true);
    expect(r.summary.claimVerificationReadCount).toBeGreaterThanOrEqual(1);
    expect(r.summary.productionWrites).toBe(0);
    expect(r.summary.authWrites).toBe(0);
    expect(r.summary.financeWrites).toBe(0);
    expect(r.summary.tripWrites).toBe(0);
    expect(r.summary.logicalFixtureNameMatch).toBe(true);
    expect(PHASE_5I_LOGICAL_FIXTURE_NAME).toBe(
      "phase5i_driver_pilot_fixture_v1",
    );
  });

  it("armed without ports → PENDING_OPERATOR when registry ok", async () => {
    const r = await runPhase5KVerifyProvisionedFixture({
      harnessArmed: true,
      registryOverride: {
        ok: true,
        uid: "phase5k_offline_auth_shaped_uid_001",
        logicalFixtureNameMatch: true,
        provisioningStatusMatch: true,
        status: "pilot_ready",
        registryPath: "/tmp/fake-registry.json",
      },
    });
    expect(r.summary.overallStatus).toBe("PENDING_OPERATOR");
    expect(r.summary.pilotDryRunEligible).toBe(false);
  });

  it("pass conditions require claimVerificationReadCount >= 1", () => {
    const base = {
      authUserFound: true,
      authDisabled: true,
      expectedClaimsMatch: true,
      elevatedClaimsFound: false,
      firestoreFixtureFound: true,
      synthetic: true,
      operationalDriver: true,
      registrationStatus: "pending_review",
      countryMapped: true,
      cityMapped: true,
      hasActiveTrip: false as const,
      financialImpact: "none" as const,
      pendingSettlement: false as const,
      walletMutationRequired: false as const,
      rbacPass: true,
      scopePass: true,
      transitionAllowed: true,
      preconditionAvailable: true,
      productionWrites: 0,
      claimVerificationReadCount: 0,
    };
    expect(evaluatePhase5KPassConditions(base).ok).toBe(false);
    expect(
      evaluatePhase5KPassConditions({
        ...base,
        claimVerificationReadCount: 1,
      }).ok,
    ).toBe(true);
  });

  it("empty summary defaults pilotDryRunEligible false", () => {
    expect(emptyPhase5KVerificationSafeSummary().pilotDryRunEligible).toBe(
      false,
    );
  });
});

describe("Phase 5K — env preservation", () => {
  it("preserves PHASE5K; never write-enabling flags", () => {
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE",
    );
    expect(OPERATOR_HARNESS_NEVER_PRESERVE_KEYS).toEqual(
      expect.arrayContaining([
        "PHASE5I_PROVISION_SYNTHETIC_DRIVER",
        "SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED",
        "GLOBAL_PRODUCTION_WRITE_ENABLED",
        "DRIVER_WRITE_ENABLED",
      ]),
    );

    const captured = captureOperatorHarnessEnv({
      PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE: "1",
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: undefined,
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: undefined,
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: undefined,
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });

    const env: Record<string, string | undefined> = {
      PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE: "1",
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });
});
