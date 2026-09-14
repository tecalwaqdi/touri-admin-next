/**
 * Phase 5K — Pilot compatibility check WITHOUT apply.
 * RequestDriverChangesCommand / needs_changes: RBAC, scope, transition,
 * precondition presence, active-trip. All write flags must remain false.
 */

import { createRequestDriverChangesCommand } from "@/application/controlled-writes/drivers/DriverWriteCommands";
import { actorMayWriteDrivers } from "@/application/controlled-writes/drivers/DriverWriteRbac";
import { assertDriverWriteScope } from "@/application/controlled-writes/drivers/DriverWriteScope";
import { evaluateDriverWritePreconditions } from "@/application/controlled-writes/drivers/DriverWritePreconditions";
import { resolveDriverTransition } from "@/application/controlled-writes/drivers/DriverStateMachine";
import type {
  DriverWriteSnapshot,
  VerifiedDriverWriteActor,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { permissionsForRole } from "@/permissions/rbac";
import { PHASE_5K_REQUIRED_WRITE_FLAGS_FALSE } from "@/application/controlled-writes/pilot/isPhase5KVerifyProvisionedDriverFixtureEnabled";
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";

export type Phase5KPilotCompatibilityResult = {
  readonly rbacPass: boolean;
  readonly scopePass: boolean;
  readonly transitionAllowed: boolean;
  readonly preconditionAvailable: boolean;
  readonly activeTripGuardPass: boolean;
  readonly commandConstructed: boolean;
  readonly preconditionsPass: boolean;
  readonly allWriteFlagsFalse: boolean;
  readonly productionApplyReachable: false;
  readonly denials: readonly string[];
};

export function buildPhase5KSuperAdminActor(
  uid = "phase5k_pilot_actor",
): VerifiedDriverWriteActor {
  return {
    uid,
    role: "super_admin",
    permissions: permissionsForRole("super_admin"),
    scope: { type: "global" },
  };
}

/**
 * Build a write snapshot from verified fixture facts (no Production mutation).
 * preconditionToken must be non-empty for preconditionAvailable=true.
 */
export function buildPhase5KDriverWriteSnapshot(input: {
  driverId: string;
  registrationStatus: "pending_review";
  operationalDriver: true;
  hasActiveTrip: false;
  countryId: string;
  preconditionToken: string | null;
}): DriverWriteSnapshot {
  return {
    driverId: input.driverId,
    exists: true,
    isOperationalDriver: input.operationalDriver,
    registrationStatus: input.registrationStatus,
    accountEnabled: "disabled",
    complianceStatus: "unknown",
    tripState: input.hasActiveTrip ? "busy" : "idle",
    countryId: input.countryId,
    countryScopeKind: "mapped",
    preconditionToken: input.preconditionToken?.trim() || "",
  };
}

export function evaluatePhase5KPilotCompatibility(input: {
  driverId: string;
  registrationStatus: string | null;
  operationalDriver: boolean;
  hasActiveTrip: boolean | "unknown";
  countryId: string | null;
  preconditionToken: string | null;
  writeFlags?: typeof PHASE_5K_REQUIRED_WRITE_FLAGS_FALSE;
}): Phase5KPilotCompatibilityResult {
  const denials: string[] = [];
  const flags = input.writeFlags ?? PHASE_5K_REQUIRED_WRITE_FLAGS_FALSE;

  const allWriteFlagsFalse =
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === false &&
    flags.PRODUCTION_WRITE_ENABLED === false &&
    flags.DRIVER_WRITE_ENABLED === false &&
    flags.AGENT_WRITE_ENABLED === false &&
    flags.CUSTOMER_WRITE_ENABLED === false &&
    flags.CUSTOMER_AUTH_WRITE_ENABLED === false &&
    flags.FINANCE_WRITE_ENABLED === false &&
    flags.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED === false;

  if (!allWriteFlagsFalse) denials.push("WRITE_FLAGS_NOT_FALSE");
  if (CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled !== false) {
    denials.push("productionWritesEnabled must be false");
  }

  const reachable = ProductionDriverWriteRepository.isReachable({
    GLOBAL_PRODUCTION_WRITE_ENABLED: flags.GLOBAL_PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: flags.DRIVER_WRITE_ENABLED,
  });
  if (reachable) denials.push("PRODUCTION_WRITE_REPO_REACHABLE");

  const actor = buildPhase5KSuperAdminActor();
  const rbacPass = actorMayWriteDrivers(actor, "needs_changes");
  if (!rbacPass) denials.push("RBAC_FAIL");

  const transition = resolveDriverTransition(
    "needs_changes",
    input.registrationStatus === "pending_review"
      ? "pending_review"
      : "unknown",
  );
  const transitionAllowed =
    transition.ok && input.registrationStatus === "pending_review";
  if (!transitionAllowed) denials.push("TRANSITION_NOT_ALLOWED");

  const activeTripGuardPass = input.hasActiveTrip === false;
  if (!activeTripGuardPass) denials.push("ACTIVE_TRIP_GUARD_FAIL");

  const preconditionAvailable = Boolean(
    input.preconditionToken && input.preconditionToken.trim().length > 0,
  );
  if (!preconditionAvailable) denials.push("PRECONDITION_UNAVAILABLE");

  let scopePass = false;
  let commandConstructed = false;
  let preconditionsPass = false;

  if (
    input.operationalDriver &&
    input.registrationStatus === "pending_review" &&
    input.countryId &&
    preconditionAvailable &&
    activeTripGuardPass
  ) {
    const snapshot = buildPhase5KDriverWriteSnapshot({
      driverId: input.driverId,
      registrationStatus: "pending_review",
      operationalDriver: true,
      hasActiveTrip: false,
      countryId: input.countryId,
      preconditionToken: input.preconditionToken,
    });

    try {
      assertDriverWriteScope(actor, snapshot);
      scopePass = true;
    } catch {
      denials.push("SCOPE_FAIL");
      scopePass = false;
    }

    try {
      const command = createRequestDriverChangesCommand({
        actor,
        driverId: input.driverId,
        expectedCurrentState: "pending_review",
        preconditionToken: input.preconditionToken!.trim(),
        idempotencyKey: "phase5k_verify_no_apply",
        correlationId: "phase5k_verify_no_apply",
        reasonCode: "missing_document",
      });
      commandConstructed = true;
      evaluateDriverWritePreconditions(command, snapshot);
      preconditionsPass = true;
    } catch (err) {
      denials.push(
        `PRECONDITION_EVAL:${err instanceof Error ? err.message : "failed"}`,
      );
    }
  } else {
    if (!input.operationalDriver) denials.push("NOT_OPERATIONAL_DRIVER");
    if (!input.countryId) denials.push("COUNTRY_ID_MISSING");
  }

  return {
    rbacPass,
    scopePass,
    transitionAllowed,
    preconditionAvailable,
    activeTripGuardPass,
    commandConstructed,
    preconditionsPass,
    allWriteFlagsFalse,
    productionApplyReachable: false,
    denials,
  };
}
