/**
 * Phase 5L — offline unit tests for Driver Pilot dry-run (plan only).
 * Production / Auth / Finance / Trip writes = 0.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPhase5LDriverPilotDryRunEnabled } from "@/application/controlled-writes/pilot/isPhase5LDriverPilotDryRunEnabled";
import {
  buildPhase5LSuperAdminActor,
  runPhase5LDriverPilotDryRun,
} from "@/application/controlled-writes/pilot/Phase5LDriverPilotDryRun";
import { createPhase5KFakeReadOnlyPorts } from "@/application/controlled-writes/pilot/Phase5KFakePorts";
import { PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import { PHASE_5I_LOGICAL_FIXTURE_NAME } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";
import { evaluatePhase5LPlannedDiff } from "@/application/controlled-writes/pilot/Phase5LPlannedDiff";
import {
  PHASE_5L_PILOT_IDEMPOTENCY_KEY,
  planPhase5LAudit,
  planPhase5LIdempotency,
} from "@/application/controlled-writes/pilot/Phase5LIdempotencyAuditPlan";
import { classifyPhase5LAuthTriggerExpectation } from "@/application/controlled-writes/pilot/Phase5LAuthTriggerExpectation";
import {
  PHASE_5L_EXPECTED_FUTURE_WRITE_COUNTS,
  planPhase5LExactFutureWriteCounts,
} from "@/application/controlled-writes/pilot/Phase5LExpectedWriteCounts";
import {
  emptyPhase5LDryRunSafeSummary,
  evaluatePhase5LPassConditions,
} from "@/application/controlled-writes/pilot/Phase5LDryRunSafeSummary";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
  OPERATOR_HARNESS_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { permissionsForRole } from "@/permissions/rbac";
import type { VerifiedDriverWriteActor } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type { Phase5KRegistrySourceResult } from "@/application/controlled-writes/pilot/Phase5KRegistrySource";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";

const REGISTRY_OK: Phase5KRegistrySourceResult = {
  ok: true,
  uid: "phase5l_offline_fixture_uid_001",
  logicalFixtureNameMatch: true,
  provisioningStatusMatch: true,
  status: "pilot_ready",
  registryPath: ".local/phase5j-fixture/registry.json",
};

function auditorActor(): VerifiedDriverWriteActor {
  return {
    uid: "auditor_1",
    role: "auditor",
    permissions: permissionsForRole("auditor"),
    scope: { type: "global" },
  };
}

function scopedSuperAdminWrongCountry(): VerifiedDriverWriteActor {
  return {
    uid: "sa_scoped_wrong",
    role: "super_admin",
    permissions: permissionsForRole("super_admin"),
    scope: { type: "country", countryIds: ["egypt"] },
  };
}

describe("Phase 5L — gate exact-1", () => {
  it("flag absent / 0 / true → disabled", () => {
    expect(isPhase5LDriverPilotDryRunEnabled(undefined)).toBe(false);
    expect(isPhase5LDriverPilotDryRunEnabled("")).toBe(false);
    expect(isPhase5LDriverPilotDryRunEnabled("0")).toBe(false);
    expect(isPhase5LDriverPilotDryRunEnabled("true")).toBe(false);
  });

  it("flag 1 → armed", () => {
    expect(isPhase5LDriverPilotDryRunEnabled("1")).toBe(true);
  });
});

describe("Phase 5L — planned diff / idempotency / audit / Auth trigger / write counts", () => {
  it("planned diff allowlist is registration_status only", () => {
    const ok = evaluatePhase5LPlannedDiff();
    expect(ok.plannedDiffValid).toBe(true);
    expect(ok.plannedDiff).toEqual({ registration_status: "needs_changes" });

    const bad = evaluatePhase5LPlannedDiff({
      patch: { registration_status: "needs_changes", actev_mndob: true },
    });
    expect(bad.plannedDiffValid).toBe(false);
  });

  it("idempotency planning ready without persist", () => {
    const p = planPhase5LIdempotency();
    expect(p.idempotencyReady).toBe(true);
    expect(p.keyLogical).toBe(PHASE_5L_PILOT_IDEMPOTENCY_KEY);
    expect(p.persisted).toBe(false);
    expect(p.writes).toBe(0);
  });

  it("audit planning 1+1 without write", () => {
    const a = planPhase5LAudit({ actorRole: "super_admin" });
    expect(a.auditPlanReady).toBe(true);
    expect(a.auditIntent).toBe(1);
    expect(a.auditResult).toBe(1);
    expect(a.persisted).toBe(false);
    expect(a.writes).toBe(0);
  });

  it("expected Auth trigger true; claims change false", () => {
    const a = classifyPhase5LAuthTriggerExpectation();
    expect(a.expectedAuthTrigger).toBe(true);
    expect(a.expectedClaimsChange).toBe(false);
    expect(a.setCustomUserClaimsPlannedInDryRun).toBe(false);
    expect(a.authClaimWritesIfApplied).toBe(1);
  });

  it("exact future write counts known from implementation", () => {
    const c = planPhase5LExactFutureWriteCounts();
    expect(c).toEqual(PHASE_5L_EXPECTED_FUTURE_WRITE_COUNTS);
    expect(c.driverDomainWrites).toBe(1);
    expect(c.auditIntentWrites).toBe(1);
    expect(c.auditResultWrites).toBe(1);
    expect(c.idempotencyWrites).toBe(1);
    expect(c.authClaimWrites).toBe(1);
    expect(c.financeWrites).toBe(0);
    expect(c.tripWrites).toBe(0);
    expect(c.agentWrites).toBe(0);
    expect(c.customerWrites).toBe(0);
  });
});

describe("Phase 5L — dry-run orchestrator offline", () => {
  it("SKIP when harness not armed; writes remain zero", async () => {
    const r = await runPhase5LDriverPilotDryRun({ harnessArmed: false });
    expect(r.summary.overallStatus).toBe("SKIPPED");
    expect(r.summary.productionWrites).toBe(0);
    expect(r.summary.authWrites).toBe(0);
    expect(r.productionApplyInvoked).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(
      ProductionDriverWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
      }),
    ).toBe(false);
  });

  it("correct fixture targeting + pending_review → needs_changes PASS", async () => {
    const ports = createPhase5KFakeReadOnlyPorts({
      uid: REGISTRY_OK.uid,
      preconditionToken: "tok_phase5l_offline",
    });
    const r = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor: buildPhase5LSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
    });
    expect(r.summary.overallStatus).toBe("PHASE5L_DRIVER_PILOT_DRY_RUN_PASS");
    expect(r.summary.targetFound).toBe(true);
    expect(r.summary.synthetic).toBe(true);
    expect(r.summary.currentState).toBe("pending_review");
    expect(r.summary.plannedState).toBe("needs_changes");
    expect(r.summary.rbacPass).toBe(true);
    expect(r.summary.scopePass).toBe(true);
    expect(r.summary.transitionAllowed).toBe(true);
    expect(r.summary.preconditionAvailable).toBe(true);
    expect(r.summary.hasActiveTrip).toBe(false);
    expect(r.summary.financialImpact).toBe("none");
    expect(r.summary.plannedDiffValid).toBe(true);
    expect(r.summary.expectedAuthTrigger).toBe(true);
    expect(r.summary.expectedClaimsChange).toBe(false);
    expect(r.summary.idempotencyReady).toBe(true);
    expect(r.summary.auditPlanReady).toBe(true);
    expect(r.summary.exactWriteCountsKnown).toBe(true);
    expect(r.summary.wouldApplyDriverMutation).toBe(true);
    expect(r.summary.actualDriverWrites).toBe(0);
    expect(r.summary.authWrites).toBe(0);
    expect(r.summary.financeWrites).toBe(0);
    expect(r.summary.tripWrites).toBe(0);
    expect(r.summary.productionWrites).toBe(0);
    expect(r.productionApplyInvoked).toBe(false);
    expect(r.commandConstructed).toBe(true);
    // Never leak token/UID in summary serialization
    const serialized = JSON.stringify(r.summary);
    expect(serialized).not.toMatch(/tok_phase5l/);
    expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
  });

  it("wrong current state → PILOT_PRECONDITION_FAILED / NO_GO", async () => {
    const data = {
      ...(PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
        string,
        unknown
      >),
      registration_status: "approved",
    };
    const ports = createPhase5KFakeReadOnlyPorts({
      uid: REGISTRY_OK.uid,
      firestoreData: data,
      preconditionToken: "tok",
    });
    const r = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor: buildPhase5LSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
    });
    expect(r.summary.overallStatus).toBe("PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO");
    expect(r.summary.denials).toEqual(
      expect.arrayContaining(["PILOT_PRECONDITION_FAILED"]),
    );
    expect(r.summary.productionWrites).toBe(0);
  });

  it("RBAC deny → NO_GO", async () => {
    const ports = createPhase5KFakeReadOnlyPorts({
      uid: REGISTRY_OK.uid,
      preconditionToken: "tok",
    });
    const r = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor: auditorActor(),
      ports,
      registryOverride: REGISTRY_OK,
    });
    expect(r.summary.rbacPass).toBe(false);
    expect(r.summary.overallStatus).toBe("PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO");
    expect(r.summary.denials).toEqual(expect.arrayContaining(["RBAC_FAIL"]));
    expect(r.summary.actualDriverWrites).toBe(0);
  });

  it("scope deny → NO_GO", async () => {
    const ports = createPhase5KFakeReadOnlyPorts({
      uid: REGISTRY_OK.uid,
      preconditionToken: "tok",
    });
    const r = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor: scopedSuperAdminWrongCountry(),
      ports,
      registryOverride: REGISTRY_OK,
    });
    expect(r.summary.rbacPass).toBe(true);
    expect(r.summary.scopePass).toBe(false);
    expect(r.summary.overallStatus).toBe("PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO");
    expect(r.summary.denials).toEqual(expect.arrayContaining(["SCOPE_FAIL"]));
  });

  it("active-trip deny → DRIVER_HAS_ACTIVE_TRIP / NO_GO", async () => {
    const data = {
      ...(PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
        string,
        unknown
      >),
      on_trip: true,
    };
    const ports = createPhase5KFakeReadOnlyPorts({
      uid: REGISTRY_OK.uid,
      firestoreData: data,
      preconditionToken: "tok",
    });
    const r = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor: buildPhase5LSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
    });
    expect(r.summary.hasActiveTrip).not.toBe(false);
    expect(r.summary.overallStatus).toBe("PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO");
    expect(r.summary.denials).toEqual(
      expect.arrayContaining(["DRIVER_HAS_ACTIVE_TRIP"]),
    );
  });

  it("precondition missing → NO_GO", async () => {
    const ports = createPhase5KFakeReadOnlyPorts({
      uid: REGISTRY_OK.uid,
      preconditionToken: null,
    });
    const r = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor: buildPhase5LSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
    });
    expect(r.summary.preconditionAvailable).toBe(false);
    expect(r.summary.overallStatus).toBe("PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO");
    expect(r.summary.denials).toEqual(
      expect.arrayContaining(["PRECONDITION_UNAVAILABLE"]),
    );
  });

  it("empty summary defaults fail closed", () => {
    const s = emptyPhase5LDryRunSafeSummary();
    expect(evaluatePhase5LPassConditions(s).ok).toBe(false);
    expect(s.overallStatus).toBe("SKIPPED");
  });
});

describe("Phase 5L — env preservation + summary writer", () => {
  it("preserves PHASE5L + FIREBASE_ID_TOKEN; never write-enabling flags", () => {
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5L_DRIVER_PILOT_DRY_RUN",
    );
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain("FIREBASE_ID_TOKEN");
    const captured = captureOperatorHarnessEnv({
      PHASE5L_DRIVER_PILOT_DRY_RUN: "1",
      FIREBASE_ID_TOKEN: "phase5l_offline_token",
      PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE: undefined,
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: undefined,
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: undefined,
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: undefined,
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5L_DRIVER_PILOT_DRY_RUN: "1",
      FIREBASE_ID_TOKEN: "phase5l_offline_token",
      PHASE5I_PROVISION_SYNTHETIC_DRIVER: "1",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5L_DRIVER_PILOT_DRY_RUN).toBe("1");
    expect(env.FIREBASE_ID_TOKEN).toBe("phase5l_offline_token");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });

  it("writes dry-run-safe-summary.json without secrets/PII", async () => {
    const dir = join(process.cwd(), ".local", "phase5l-driver-pilot-unit");
    const path = join(dir, "dry-run-safe-summary.json");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const ports = createPhase5KFakeReadOnlyPorts({
      uid: REGISTRY_OK.uid,
      preconditionToken: "tok_secret_should_not_leak",
    });
    const r = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor: buildPhase5LSuperAdminActor(),
      ports,
      registryOverride: REGISTRY_OK,
    });
    const serialized = JSON.stringify(r.summary, null, 2);
    writeFileSync(path, serialized);
    expect(existsSync(path)).toBe(true);
    expect(driverLiveReportHasSensitiveLeak(serialized)).toBe(false);
    expect(serialized).not.toMatch(/tok_secret|password|id_token|BEGIN PRIVATE/i);
    expect(serialized).not.toMatch(/"uid"\s*:/);
    expect(readFileSync(path, "utf8")).toContain(
      "PHASE5L_DRIVER_PILOT_DRY_RUN_PASS",
    );
    expect(PHASE_5I_LOGICAL_FIXTURE_NAME).toMatch(/phase5i/);
    rmSync(dir, { recursive: true, force: true });
  });
});
