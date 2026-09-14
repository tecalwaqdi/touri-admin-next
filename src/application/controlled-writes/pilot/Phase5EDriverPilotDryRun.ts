/**
 * Phase 5E — Dry-run planner for Driver needs_changes Pilot.
 * Read/validate/plan only. Writes = 0. Write flags remain false.
 * wouldWrite=true, actualWrite=false when plan is valid.
 */

import {
  CONTROLLED_WRITES_ENABLEMENT,
  assertEnablementNotActivated,
} from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE,
} from "@/application/controlled-writes/drivers/DriverWriteFlags";
import {
  buildNeedsChangesAllowlistedPatch,
  evaluatePilotDomainDiff,
  PHASE_5E_EXACT_AFTER_STATE,
  PHASE_5E_EXACT_BEFORE_STATE,
  assertFirestorePatchAllowlisted,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotDiffContract";
import {
  AUTH_REQUIRED_FOR_PILOT_TARGET,
  PHASE_5E_EXPECTED_PROJECT_ID,
  assertPilotTargetIsSynthetic,
  assessAuthDependencyForPilot,
} from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";
import {
  PHASE_5E_EXPECTED_WRITE_COUNTS_PREPARATION,
  PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED,
  PHASE_5E_ZERO_IMPACT_CHECKS,
  buildPhase5ERollbackPlan,
  type Phase5EPilotObservabilitySummary,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotGates";
import { resolveDriverTransition } from "@/application/controlled-writes/drivers/DriverStateMachine";

export type Phase5EDryRunInput = {
  projectId: string;
  pilotDriverId: string;
  expectedBeforeState: string;
  preconditionToken: string;
  operatorIdentity: string;
  actorRole: string;
  /** Snapshot fields observed (or planned) — no PII. */
  observed?: {
    registrationStatus?: string;
    accountEnabled?: string;
    tripState?: string;
    isOperationalDriver?: boolean;
    is_test?: boolean;
    functional_test?: boolean;
  };
};

export type Phase5EDryRunResult = {
  ok: boolean;
  mode: "dry_run";
  wouldWrite: boolean;
  actualWrite: false;
  writeFlagsRemainFalse: true;
  productionWrites: 0;
  authWrites: 0;
  financeWrites: 0;
  tripWrites: 0;
  plannedAction: "needs_changes";
  plannedBefore: typeof PHASE_5E_EXACT_BEFORE_STATE.registrationStatus;
  plannedAfter: typeof PHASE_5E_EXACT_AFTER_STATE.registrationStatus;
  allowlistedPatch: ReturnType<typeof buildNeedsChangesAllowlistedPatch>;
  AUTH_REQUIRED_FOR_PILOT_TARGET: typeof AUTH_REQUIRED_FOR_PILOT_TARGET;
  denials: string[];
  observability: Phase5EPilotObservabilitySummary;
};

/**
 * Plan one Driver needs_changes Pilot without any mutation.
 */
export function runPhase5EDriverPilotDryRun(
  input: Phase5EDryRunInput,
): Phase5EDryRunResult {
  assertEnablementNotActivated();
  const denials: string[] = [];

  if (CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled !== false) {
    denials.push("productionWritesEnabled must be false");
  }
  if (DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE !== false) {
    denials.push("driver production hard lock must be false");
  }
  if (input.projectId !== PHASE_5E_EXPECTED_PROJECT_ID) {
    denials.push(`projectId must be ${PHASE_5E_EXPECTED_PROJECT_ID}`);
  }
  if (input.actorRole !== PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED) {
    denials.push("actorRole must be super_admin");
  }
  if (!input.operatorIdentity?.trim()) {
    denials.push("operatorIdentity required");
  }
  if (!input.preconditionToken?.trim()) {
    denials.push("preconditionToken required");
  }
  if (
    input.expectedBeforeState !==
    PHASE_5E_EXACT_BEFORE_STATE.registrationStatus
  ) {
    denials.push("expectedBeforeState must be pending_review");
  }

  const synthetic = assertPilotTargetIsSynthetic({
    driverId: input.pilotDriverId,
    data: {
      is_test: input.observed?.is_test ?? true,
      functional_test: input.observed?.functional_test ?? true,
    },
  });
  if (!synthetic.ok) {
    denials.push(synthetic.code ?? "PILOT_TARGET_NOT_SYNTHETIC");
  }

  const transition = resolveDriverTransition(
    "needs_changes",
    "pending_review",
  );
  if (!transition.ok) {
    denials.push(transition.message);
  }

  if (
    input.observed?.tripState != null &&
    input.observed.tripState !== PHASE_5E_ZERO_IMPACT_CHECKS.activeTrip.requiredTripState
  ) {
    denials.push("tripState must be idle for zero active trip");
  }
  if (
    input.observed?.isOperationalDriver != null &&
    input.observed.isOperationalDriver !== true
  ) {
    denials.push("isOperationalDriver must be true");
  }

  const patch = buildNeedsChangesAllowlistedPatch();
  const patchCheck = assertFirestorePatchAllowlisted(patch);
  if (!patchCheck.ok) {
    denials.push(`PILOT_UNEXPECTED_FIELD_MUTATION:${patchCheck.unexpectedFields.join(",")}`);
  }

  // Simulated domain diff for plan validation (token rotates by contract).
  const plannedDiff = evaluatePilotDomainDiff({
    before: {
      registrationStatus: "pending_review",
      preconditionToken: input.preconditionToken || "tok_before",
      accountEnabled: "disabled",
      tripState: "idle",
      isOperationalDriver: true,
      driverId: input.pilotDriverId,
    },
    after: {
      registrationStatus: "needs_changes",
      preconditionToken: "tok_after_planned",
      accountEnabled: "disabled",
      tripState: "idle",
      isOperationalDriver: true,
      driverId: input.pilotDriverId,
    },
  });
  if (!plannedDiff.ok) {
    denials.push(
      ...plannedDiff.unexpected.map((u) =>
        u.ok === false ? u.message : `unexpected:${u.field}`,
      ),
    );
  }

  void buildPhase5ERollbackPlan();
  void assessAuthDependencyForPilot();

  const ok = denials.length === 0;
  const observability: Phase5EPilotObservabilitySummary = {
    phase: "5E",
    mode: "dry_run",
    overallStatus: ok ? "DRY_RUN_OK" : "NO_GO",
    projectFingerprint: input.projectId,
    recommendedAction: "needs_changes",
    resource: "driver",
    beforeState: PHASE_5E_EXACT_BEFORE_STATE.registrationStatus,
    afterStateExpected: PHASE_5E_EXACT_AFTER_STATE.registrationStatus,
    wouldWrite: ok,
    actualWrite: false,
    writeFlags: {
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
    },
    writeCounts: {
      driverDomain: PHASE_5E_EXPECTED_WRITE_COUNTS_PREPARATION.driverDomain,
      audit: 0,
      idempotency: PHASE_5E_EXPECTED_WRITE_COUNTS_PREPARATION.idempotency,
      auth: 0,
      finance: 0,
      trip: 0,
    },
    AUTH_REQUIRED_FOR_PILOT_TARGET,
    syntheticTarget: synthetic.ok,
    actorRoleRequired: PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED,
    productionWriteExecuted: false,
  };

  return {
    ok,
    mode: "dry_run",
    wouldWrite: ok,
    actualWrite: false,
    writeFlagsRemainFalse: true,
    productionWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    plannedAction: "needs_changes",
    plannedBefore: "pending_review",
    plannedAfter: "needs_changes",
    allowlistedPatch: patch,
    AUTH_REQUIRED_FOR_PILOT_TARGET,
    denials,
    observability,
  };
}
