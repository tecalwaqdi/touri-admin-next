/**
 * Phase 5L — ONE Driver Pilot dry-run (plan only).
 * Target: pending_review → needs_changes via RequestDriverChangesCommand.
 * MUST NOT call Production apply/write. MUST NOT setCustomUserClaims.
 * UID only from Phase 5J registry. No fallback Driver.
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
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { permissionsForRole } from "@/permissions/rbac";
import { PHASE_5I_FIXTURE_COUNTRY_ID } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import { verifyPhase5JCanonicalFixture } from "@/application/controlled-writes/pilot/Phase5JCanonicalFixtureVerification";
import { verifyPhase5KFinanceAndTrip } from "@/application/controlled-writes/pilot/Phase5KFinanceTripVerification";
import {
  loadPhase5KFixtureUidFromRegistry,
  type Phase5KRegistrySourceResult,
} from "@/application/controlled-writes/pilot/Phase5KRegistrySource";
import type { Phase5KReadOnlyPorts } from "@/application/controlled-writes/pilot/Phase5KReadOnlyFirebaseAdapters";
import { classifyPhase5LAuthTriggerExpectation } from "@/application/controlled-writes/pilot/Phase5LAuthTriggerExpectation";
import {
  planPhase5LExactFutureWriteCounts,
  PHASE_5L_DRY_RUN_SESSION_WRITE_COUNTS,
} from "@/application/controlled-writes/pilot/Phase5LExpectedWriteCounts";
import {
  emptyPhase5LDryRunSafeSummary,
  evaluatePhase5LPassConditions,
  type Phase5LDryRunSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5LDryRunSafeSummary";
import {
  PHASE_5L_PILOT_IDEMPOTENCY_KEY,
  planPhase5LAudit,
  planPhase5LIdempotency,
} from "@/application/controlled-writes/pilot/Phase5LIdempotencyAuditPlan";
import { evaluatePhase5LPlannedDiff } from "@/application/controlled-writes/pilot/Phase5LPlannedDiff";
import {
  PHASE_5L_REQUIRED_WRITE_FLAGS_FALSE,
  type Phase5LWriteFlagSnapshot,
} from "@/application/controlled-writes/pilot/isPhase5LDriverPilotDryRunEnabled";
import { assertPhase5LWriteFlagsFalse } from "@/application/controlled-writes/pilot/Phase5LWriteFlagAssert";

export type Phase5LDryRunInput = {
  readonly harnessArmed: boolean;
  readonly cwd?: string;
  /** Injected verified actor (offline / live after Auth resolve). */
  readonly actor?: VerifiedDriverWriteActor | null;
  /** Injected ports for offline unit tests; live harness supplies ADC ports. */
  readonly ports?: Phase5KReadOnlyPorts;
  /** Optional offline registry override (tests). */
  readonly registryOverride?: Phase5KRegistrySourceResult;
  readonly writeFlags?: Phase5LWriteFlagSnapshot;
  /** When true, live path attempted (observability). */
  readonly liveDryRunAttempted?: boolean;
};

export type Phase5LDryRunResult = {
  readonly summary: Phase5LDryRunSafeSummary;
  /** Opaque — never serialize into safe summary. */
  readonly preconditionTokenPresent: boolean;
  readonly commandConstructed: boolean;
  readonly productionApplyInvoked: false;
};

export function buildPhase5LSuperAdminActor(
  uid = "phase5l_pilot_actor",
): VerifiedDriverWriteActor {
  return {
    uid,
    role: "super_admin",
    permissions: permissionsForRole("super_admin"),
    scope: { type: "global" },
  };
}

function buildSnapshot(input: {
  driverId: string;
  registrationStatus: "pending_review";
  operationalDriver: true;
  hasActiveTrip: false;
  countryId: string;
  preconditionToken: string;
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
    preconditionToken: input.preconditionToken,
  };
}

/**
 * Run Phase 5L dry-run. When harnessArmed=false → SKIPPED.
 * Never invokes ProductionDriverWriteRepository.apply / setCustomUserClaims.
 */
export async function runPhase5LDriverPilotDryRun(
  input: Phase5LDryRunInput,
): Promise<Phase5LDryRunResult> {
  const writeFlags = input.writeFlags ?? PHASE_5L_REQUIRED_WRITE_FLAGS_FALSE;
  const flagsOk = assertPhase5LWriteFlagsFalse(writeFlags);
  const sessionZeros = PHASE_5L_DRY_RUN_SESSION_WRITE_COUNTS;

  if (!input.harnessArmed) {
    return {
      summary: emptyPhase5LDryRunSafeSummary({
        overallStatus: "SKIPPED",
        allWriteFlagsFalseAfterRun: flagsOk,
        blocker: "PHASE5L_DRIVER_PILOT_DRY_RUN!=1",
        liveDryRunAttempted: false,
      }),
      preconditionTokenPresent: false,
      commandConstructed: false,
      productionApplyInvoked: false,
    };
  }

  const denials: string[] = [];

  if (!flagsOk) denials.push("WRITE_FLAGS_NOT_FALSE");
  if (CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled !== false) {
    denials.push("productionWritesEnabled must be false");
  }
  const reachable = ProductionDriverWriteRepository.isReachable({
    GLOBAL_PRODUCTION_WRITE_ENABLED: writeFlags.GLOBAL_PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: writeFlags.DRIVER_WRITE_ENABLED,
  });
  if (reachable) denials.push("PRODUCTION_WRITE_REPO_REACHABLE");

  const registry =
    input.registryOverride ??
    loadPhase5KFixtureUidFromRegistry(input.cwd ?? process.cwd());

  if (!registry.ok) {
    const summary = emptyPhase5LDryRunSafeSummary({
      overallStatus: "PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO",
      dryRunExecuted: true,
      targetFound: false,
      allWriteFlagsFalseAfterRun: flagsOk,
      denials: [registry.code, ...denials],
      blocker: registry.message,
      liveDryRunAttempted: input.liveDryRunAttempted ?? false,
      actualDriverWrites: 0,
      authWrites: 0,
      financeWrites: 0,
      tripWrites: 0,
      agentWrites: 0,
      customerWrites: 0,
      productionWrites: 0,
    });
    return {
      summary,
      preconditionTokenPresent: false,
      commandConstructed: false,
      productionApplyInvoked: false,
    };
  }

  if (!input.ports) {
    return {
      summary: emptyPhase5LDryRunSafeSummary({
        overallStatus: "PENDING_OPERATOR",
        dryRunExecuted: false,
        targetFound: true,
        allWriteFlagsFalseAfterRun: flagsOk,
        blocker:
          "PENDING_OPERATOR — registry OK; ADC read-only ports / verified actor not supplied",
        liveDryRunAttempted: input.liveDryRunAttempted ?? false,
        denials,
      }),
      preconditionTokenPresent: false,
      commandConstructed: false,
      productionApplyInvoked: false,
    };
  }

  const actor = input.actor ?? null;
  if (!actor) {
    return {
      summary: emptyPhase5LDryRunSafeSummary({
        overallStatus: "PENDING_OPERATOR",
        dryRunExecuted: false,
        targetFound: true,
        allWriteFlagsFalseAfterRun: flagsOk,
        actorVerified: false,
        blocker:
          "PENDING_OPERATOR — verified Production super_admin actor required (closed Auth ID-token path)",
        liveDryRunAttempted: input.liveDryRunAttempted ?? false,
        denials: [...denials, "ACTOR_MISSING"],
      }),
      preconditionTokenPresent: false,
      commandConstructed: false,
      productionApplyInvoked: false,
    };
  }

  const ports = input.ports;
  const uid = registry.uid;

  // Re-read fixture (Auth + Firestore) before planning.
  await ports.auth.getUser(uid);
  const fsDoc = await ports.firestore.getUserDoc(uid);

  const canonical = verifyPhase5JCanonicalFixture({
    uid,
    data: fsDoc.exists && fsDoc.data ? fsDoc.data : undefined,
  });

  const financeTrip = verifyPhase5KFinanceAndTrip(
    fsDoc.exists ? fsDoc.data : null,
  );

  const targetFound = Boolean(fsDoc.exists && fsDoc.data);
  const synthetic = canonical.ok ? canonical.synthetic : false;
  const operationalDriver = canonical.ok ? canonical.operationalDriver : false;
  const currentState = canonical.ok
    ? canonical.registrationStatus
    : fsDoc.data && typeof fsDoc.data.registration_status === "string"
      ? String(fsDoc.data.registration_status)
      : null;

  // Precondition: pending_review + synthetic + operational + no active trip
  if (
    !targetFound ||
    !synthetic ||
    !operationalDriver ||
    currentState !== "pending_review" ||
    financeTrip.hasActiveTrip !== false
  ) {
    denials.push("PILOT_PRECONDITION_FAILED");
    if (financeTrip.hasActiveTrip === true) {
      denials.push("DRIVER_HAS_ACTIVE_TRIP");
    }
    const summary = emptyPhase5LDryRunSafeSummary({
      overallStatus: "PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO",
      dryRunExecuted: true,
      targetFound,
      synthetic,
      operationalDriver,
      currentState,
      plannedState: "needs_changes",
      hasActiveTrip: financeTrip.hasActiveTrip,
      financialImpact: financeTrip.financialImpact,
      preconditionAvailable: Boolean(
        fsDoc.preconditionToken && fsDoc.preconditionToken.trim().length > 0,
      ),
      allWriteFlagsFalseAfterRun: flagsOk,
      productionReads: ports.readCounter.productionReads,
      liveDryRunAttempted: input.liveDryRunAttempted ?? false,
      actorRole: actor.role,
      actorVerified: true,
      denials: [...denials, ...financeTrip.denials],
      blocker: denials.includes("DRIVER_HAS_ACTIVE_TRIP")
        ? "DRIVER_HAS_ACTIVE_TRIP"
        : "PILOT_PRECONDITION_FAILED",
      ...sessionZeros,
    });
    return {
      summary,
      preconditionTokenPresent: Boolean(fsDoc.preconditionToken?.trim()),
      commandConstructed: false,
      productionApplyInvoked: false,
    };
  }

  const preconditionToken = (fsDoc.preconditionToken ?? "").trim();
  const preconditionAvailable = preconditionToken.length > 0;
  if (!preconditionAvailable) denials.push("PRECONDITION_UNAVAILABLE");

  const transition = resolveDriverTransition(
    "needs_changes",
    "pending_review",
  );
  const transitionAllowed = transition.ok === true;
  if (!transitionAllowed) denials.push("TRANSITION_NOT_ALLOWED");

  const rbacPass =
    actor.role === "super_admin" &&
    actorMayWriteDrivers(actor, "needs_changes");
  if (!rbacPass) denials.push("RBAC_FAIL");

  const plannedDiff = evaluatePhase5LPlannedDiff();
  if (!plannedDiff.plannedDiffValid) denials.push(...plannedDiff.denials);

  const authTrigger = classifyPhase5LAuthTriggerExpectation();
  const idemp = planPhase5LIdempotency();
  const audit = planPhase5LAudit({ actorRole: actor.role });
  const futureCounts = planPhase5LExactFutureWriteCounts();

  let scopePass = false;
  let commandConstructed = false;
  let preconditionsPass = false;

  if (preconditionAvailable && rbacPass && transitionAllowed) {
    const snapshot = buildSnapshot({
      driverId: uid,
      registrationStatus: "pending_review",
      operationalDriver: true,
      hasActiveTrip: false,
      countryId: PHASE_5I_FIXTURE_COUNTRY_ID,
      preconditionToken,
    });

    try {
      assertDriverWriteScope(actor, snapshot);
      scopePass = true;
    } catch {
      denials.push("SCOPE_FAIL");
      scopePass = false;
    }

    if (scopePass) {
      try {
        const command = createRequestDriverChangesCommand({
          actor,
          driverId: uid,
          expectedCurrentState: "pending_review",
          preconditionToken,
          idempotencyKey: PHASE_5L_PILOT_IDEMPOTENCY_KEY,
          correlationId: PHASE_5L_PILOT_IDEMPOTENCY_KEY,
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
    }
  } else if (!rbacPass) {
    // still attempt scope only for diagnostics when possible
    scopePass = false;
  }

  const base: Phase5LDryRunSafeSummary = {
    overallStatus: "PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO",
    dryRunExecuted: true,
    targetFound: true,
    synthetic: true,
    operationalDriver: true,
    currentState: "pending_review",
    plannedState: "needs_changes",
    rbacPass,
    scopePass,
    transitionAllowed,
    preconditionAvailable,
    hasActiveTrip: false,
    financialImpact: financeTrip.financialImpact,
    plannedDiffValid: plannedDiff.plannedDiffValid,
    expectedAuthTrigger: authTrigger.expectedAuthTrigger,
    expectedClaimsChange: authTrigger.expectedClaimsChange,
    idempotencyReady: idemp.idempotencyReady,
    auditPlanReady: audit.auditPlanReady,
    exactWriteCountsKnown: true,
    exactFutureWriteCounts: futureCounts,
    wouldApplyDriverMutation: true,
    actualDriverWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    productionWrites: 0,
    allWriteFlagsFalseAfterRun: flagsOk,
    actorRole: actor.role,
    actorVerified: true,
    productionReads: ports.readCounter.productionReads,
    liveDryRunAttempted: input.liveDryRunAttempted ?? false,
    denials: [
      ...denials,
      ...financeTrip.denials.filter((d) => !d.startsWith("ACTIVE_TRIP:false")),
      ...(preconditionsPass ? [] : commandConstructed ? [] : []),
    ],
  };

  if (financeTrip.financialImpact !== "none") {
    base.denials = [...(base.denials ?? []), "FINANCE_IMPACT_NOT_NONE"];
  }

  const pass = evaluatePhase5LPassConditions(base);
  const ok =
    pass.ok &&
    flagsOk &&
    !reachable &&
    preconditionsPass &&
    commandConstructed &&
    authTrigger.expectedAuthTrigger === true &&
    authTrigger.expectedClaimsChange === false;

  const summary: Phase5LDryRunSafeSummary = {
    ...base,
    overallStatus: ok
      ? "PHASE5L_DRIVER_PILOT_DRY_RUN_PASS"
      : "PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO",
    denials: ok
      ? []
      : [...(base.denials ?? []), ...(!pass.ok ? pass.denials : [])],
    blocker: ok
      ? undefined
      : [...(base.denials ?? []), ...(!pass.ok ? pass.denials : [])].join(",") ||
        "DRY_RUN_NO_GO",
  };

  return {
    summary,
    preconditionTokenPresent: preconditionAvailable,
    commandConstructed,
    productionApplyInvoked: false,
  };
}
