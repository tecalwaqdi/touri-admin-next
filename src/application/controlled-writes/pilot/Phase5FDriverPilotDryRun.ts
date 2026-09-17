/**
 * Phase 5F — Driver needs_changes Production dry-run planner.
 * Read/validate/plan only. MUST NOT invoke ProductionDriverWriteRepository.apply().
 * Write flags remain false. Fail-closed DRY_RUN_NO_GO. Never fall back to real Driver.
 */

import {
  CONTROLLED_WRITES_ENABLEMENT,
  assertEnablementNotActivated,
} from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE,
} from "@/application/controlled-writes/drivers/DriverWriteFlags";
import {
  ProductionDriverWriteRepository,
  createProductionRuntimeDriverWriteRepository,
} from "@/application/controlled-writes/drivers/DriverWriteRepository";
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
} from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";
import {
  PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED,
  PHASE_5E_PRECONDITION_AND_IDEMPOTENCY_PLAN,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotGates";
import {
  planProductionDriverWriteTransaction,
} from "@/application/controlled-writes/pilot/Phase5EProductionDriverWriteAllowlist";
import { resolveDriverTransition } from "@/application/controlled-writes/drivers/DriverStateMachine";
import { validateDriverIdempotencyKey } from "@/application/controlled-writes/drivers/DriverWriteIdempotency";
import type { Phase5FDiscoveryResult } from "@/application/controlled-writes/pilot/Phase5FSyntheticTargetDiscovery";

export type Phase5FWriteFlagSnapshot = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  AGENT_WRITE_ENABLED: boolean;
  CUSTOMER_WRITE_ENABLED: boolean;
  CUSTOMER_AUTH_WRITE_ENABLED: boolean;
  FINANCE_WRITE_ENABLED: boolean;
};

export const PHASE_5F_REQUIRED_WRITE_FLAGS_FALSE: Phase5FWriteFlagSnapshot = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
};

/** §16 observability summary — no PII / no raw precondition token. */
export type Phase5FDryRunObservabilitySummary = {
  overallStatus: "DRY_RUN_PASS" | "DRY_RUN_NO_GO" | "SKIPPED";
  projectFingerprint: string;
  targetFound: boolean;
  targetSynthetic: boolean;
  targetId: string | null;
  actorRole: string;
  action: "needs_changes";
  currentState: string | null;
  plannedState: "needs_changes" | null;
  operationalDriver: boolean | null;
  activeTrip: boolean | null;
  financeImpact: "none" | "present" | null;
  authDependency: boolean;
  scopePass: boolean;
  rbacPass: boolean;
  preconditionCaptured: boolean;
  plannedDiffValid: boolean;
  wouldWrite: boolean;
  actualWrite: false;
  domainWrites: 0;
  auditWrites: 0;
  idempotencyWrites: 0;
  authWrites: 0;
  financeWrites: 0;
  tripWrites: 0;
  totalProductionWrites: 0;
  allWriteFlagsFalseAfterRun: boolean;
  productionApplyInvocationCount: 0;
  auditIntentPlanned: boolean;
  auditResultPlanned: boolean;
  idempotencyPlanned: boolean;
  disabledWritePathActive: boolean;
  denials: readonly string[];
};

export type Phase5FDryRunInput = {
  projectId: string;
  actorRole: string;
  operatorIdentity: string;
  /** Discovery result — required. Planned IDs must not be injected here. */
  discovery: Phase5FDiscoveryResult;
  /**
   * Opaque precondition token captured from live read (or offline fixture).
   * Reported only as preconditionCaptured boolean — never echoed in summary.
   */
  preconditionToken?: string | null;
  writeFlags?: Phase5FWriteFlagSnapshot;
  /** Optional scope check result from caller (country scope). Default true when target found. */
  scopePass?: boolean;
};

export type Phase5FDryRunResult = {
  ok: boolean;
  pilotStatus: "DRY_RUN_PASS" | "DRY_RUN_NO_GO";
  wouldWrite: boolean;
  actualWrite: false;
  action: "needs_changes";
  before: { registrationStatus: "pending_review" | null };
  plannedAfter: { registrationStatus: "needs_changes" | null };
  productionApplyInvocationCount: 0;
  writeFlagsRemainFalse: boolean;
  observability: Phase5FDryRunObservabilitySummary;
};

function allFlagsFalse(flags: Phase5FWriteFlagSnapshot): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === false &&
    flags.PRODUCTION_WRITE_ENABLED === false &&
    flags.DRIVER_WRITE_ENABLED === false &&
    flags.AGENT_WRITE_ENABLED === false &&
    flags.CUSTOMER_WRITE_ENABLED === false &&
    flags.CUSTOMER_AUTH_WRITE_ENABLED === false &&
    flags.FINANCE_WRITE_ENABLED === false
  );
}

/**
 * Plan a future idempotency key structure without writing a marker.
 * Nonce placeholder kept structural — not persisted.
 */
export function planPhase5FIdempotencyKey(input: {
  pilotDriverId: string;
  operatorUid: string;
  utcDate: string;
  nonce: string;
}): { planned: true; key: string; writes: 0 } {
  const key = `phase5f_drv_nc_${input.pilotDriverId}_${input.operatorUid}_${input.utcDate}_${input.nonce}`;
  validateDriverIdempotencyKey(key.slice(0, Math.min(key.length, 128)));
  return { planned: true, key: key.slice(0, 128), writes: 0 };
}

export function planPhase5FAuditMetadata(input: {
  action: "needs_changes";
  targetId: string;
  actorRole: string;
}): {
  auditIntentPlanned: true;
  auditResultPlanned: true;
  auditWrites: 0;
  productionWriteExecuted: false;
  /** Safe non-PII plan fields only. */
  planned: {
    resource: "driver";
    action: "needs_changes";
    targetId: string;
    actorRole: string;
  };
} {
  return {
    auditIntentPlanned: true,
    auditResultPlanned: true,
    auditWrites: 0,
    productionWriteExecuted: false,
    planned: {
      resource: "driver",
      action: input.action,
      targetId: input.targetId,
      actorRole: input.actorRole,
    },
  };
}

/**
 * Capture whether a live precondition token is present without leaking it.
 */
export function capturePreconditionMeta(token: string | null | undefined): {
  preconditionCaptured: boolean;
} {
  return { preconditionCaptured: Boolean(token && token.trim().length > 0) };
}

/**
 * Run Phase 5F dry-run: validate discovery + plan allowlisted mutation.
 * Guarantees ProductionDriverWriteRepository.apply is never invoked.
 */
export function runPhase5FDriverPilotDryRun(
  input: Phase5FDryRunInput,
): Phase5FDryRunResult {
  assertEnablementNotActivated();
  const denials: string[] = [];
  const flags = input.writeFlags ?? PHASE_5F_REQUIRED_WRITE_FLAGS_FALSE;
  const applyInvocationCount = { count: 0 as const };

  // Assert Production runtime writer is REAL but unreachable while flags false.
  const disabledRuntime = createProductionRuntimeDriverWriteRepository();
  const disabledWritePathActive =
    disabledRuntime.kind === "production_driver_write" ||
    disabledRuntime.kind === "disabled_driver_write";
  if (!disabledWritePathActive) {
    denials.push("DISABLED_WRITE_PATH_NOT_ACTIVE");
  }
  if (
    ProductionDriverWriteRepository.isReachable({
      GLOBAL_PRODUCTION_WRITE_ENABLED: flags.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: flags.PRODUCTION_WRITE_ENABLED,
      DRIVER_WRITE_ENABLED: flags.DRIVER_WRITE_ENABLED,
    })
  ) {
    denials.push("PRODUCTION_WRITE_REPO_REACHABLE");
  }

  if (!allFlagsFalse(flags)) {
    denials.push("WRITE_FLAGS_MUST_REMAIN_FALSE");
  }
  if (CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled !== false) {
    denials.push("productionWritesEnabled must be false");
  }
  if (DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE !== false) {
    denials.push("driver production hard lock must be false");
  }
  if (input.projectId !== PHASE_5E_EXPECTED_PROJECT_ID) {
    denials.push(`projectId must be ${PHASE_5E_EXPECTED_PROJECT_ID}`);
  }

  const rbacPass = input.actorRole === PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED;
  if (!rbacPass) {
    denials.push("PILOT_ACTOR_NOT_SUPER_ADMIN");
  }
  if (!input.operatorIdentity?.trim()) {
    denials.push("PILOT_OPERATOR_IDENTITY_REQUIRED");
  }

  if (AUTH_REQUIRED_FOR_PILOT_TARGET !== false) {
    denials.push("AUTH_DEPENDENCY_CHANGED");
  }

  const discovery = input.discovery;
  if (!discovery.targetFound) {
    denials.push(
      discovery.reason ?? "NO_SAFE_SYNTHETIC_DRIVER_EXISTS",
    );
  }

  const targetId = discovery.targetFound ? discovery.targetId : null;
  const facts = discovery.targetFound ? discovery.selectedFacts : null;
  const scopePass =
    input.scopePass ??
    (discovery.targetFound
      ? facts?.countryRepresented === true && facts?.cityRepresented === true
      : false);
  if (discovery.targetFound && !scopePass) {
    denials.push("SCOPE_FAIL");
  }

  if (discovery.targetFound && facts?.activeTrip === true) {
    denials.push("DRIVER_HAS_ACTIVE_TRIP");
  }
  if (discovery.targetFound && facts?.financeImpact !== "none") {
    denials.push("FINANCE_IMPACT_PRESENT");
  }
  if (discovery.targetFound && facts?.operationalDriver !== true) {
    denials.push("NOT_OPERATIONAL_DRIVER");
  }
  if (discovery.targetFound && facts?.synthetic !== true) {
    denials.push("NOT_PROVEN_SYNTHETIC");
  }
  if (
    discovery.targetFound &&
    facts?.currentState !== PHASE_5E_EXACT_BEFORE_STATE.registrationStatus
  ) {
    denials.push("REGISTRATION_STATUS_MISMATCH");
  }

  const precondition = capturePreconditionMeta(input.preconditionToken);
  if (discovery.targetFound && !precondition.preconditionCaptured) {
    denials.push("PRECONDITION_TOKEN_REQUIRED");
  }

  const patch = buildNeedsChangesAllowlistedPatch();
  const patchCheck = assertFirestorePatchAllowlisted(patch);
  let plannedDiffValid = patchCheck.ok;
  if (!patchCheck.ok) {
    denials.push(
      `PILOT_UNEXPECTED_FIELD_MUTATION:${patchCheck.unexpectedFields.join(",")}`,
    );
    plannedDiffValid = false;
  }

  const transition = resolveDriverTransition("needs_changes", "pending_review");
  if (!transition.ok) {
    denials.push(transition.message);
    plannedDiffValid = false;
  }

  if (discovery.targetFound && precondition.preconditionCaptured) {
    const tok = input.preconditionToken!.trim();
    const plannedDiff = evaluatePilotDomainDiff({
      before: {
        registrationStatus: "pending_review",
        preconditionToken: tok,
        accountEnabled: "disabled",
        tripState: "idle",
        isOperationalDriver: true,
        driverId: targetId,
      },
      after: {
        registrationStatus: "needs_changes",
        preconditionToken: "tok_after_planned_rotation",
        accountEnabled: "disabled",
        tripState: "idle",
        isOperationalDriver: true,
        driverId: targetId,
      },
    });
    if (!plannedDiff.ok) {
      plannedDiffValid = false;
      denials.push(
        ...plannedDiff.unexpected.map((u) =>
          u.ok === false ? u.message : `unexpected:${u.field}`,
        ),
      );
    }

    // Structural transaction plan only — never apply().
    void planProductionDriverWriteTransaction({
      action: "needs_changes",
      driverId: targetId!,
      preconditionToken: tok,
      fromState: "pending_review",
      toState: "needs_changes",
    });

    const audit = planPhase5FAuditMetadata({
      action: "needs_changes",
      targetId: targetId!,
      actorRole: input.actorRole,
    });
    void audit;

    const idem = planPhase5FIdempotencyKey({
      pilotDriverId: targetId!,
      operatorUid: input.operatorIdentity.trim() || "op",
      utcDate: "19700101",
      nonce: "plan",
    });
    void idem;
    void PHASE_5E_PRECONDITION_AND_IDEMPOTENCY_PLAN;
  }

  // CRITICAL: never call ProductionDriverWriteRepository.apply()
  // applyInvocationCount remains 0 by construction.
  const productionApplyInvocationCount = applyInvocationCount.count;
  if (productionApplyInvocationCount !== 0) {
    denials.push("UNEXPECTED_APPLY_INVOCATION");
  }

  const ok =
    denials.length === 0 &&
    discovery.targetFound === true &&
    plannedDiffValid &&
    precondition.preconditionCaptured &&
    rbacPass &&
    scopePass &&
    allFlagsFalse(flags);

  const wouldWrite = ok;
  const flagsAfter = allFlagsFalse(flags);

  const observability: Phase5FDryRunObservabilitySummary = {
    overallStatus: ok ? "DRY_RUN_PASS" : "DRY_RUN_NO_GO",
    projectFingerprint: input.projectId,
    targetFound: discovery.targetFound,
    targetSynthetic: discovery.targetFound ? true : false,
    targetId,
    actorRole: input.actorRole,
    action: "needs_changes",
    currentState: discovery.targetFound
      ? discovery.currentState
      : facts?.currentState ?? null,
    plannedState: ok || discovery.targetFound ? "needs_changes" : null,
    operationalDriver: facts?.operationalDriver ?? null,
    activeTrip: discovery.targetFound ? discovery.activeTrip : facts?.activeTrip ?? null,
    financeImpact: discovery.targetFound
      ? discovery.financeImpact
      : facts?.financeImpact ?? null,
    authDependency: AUTH_REQUIRED_FOR_PILOT_TARGET,
    scopePass,
    rbacPass,
    preconditionCaptured: precondition.preconditionCaptured,
    plannedDiffValid,
    wouldWrite,
    actualWrite: false,
    domainWrites: 0,
    auditWrites: 0,
    idempotencyWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    totalProductionWrites: 0,
    allWriteFlagsFalseAfterRun: flagsAfter,
    productionApplyInvocationCount: 0,
    auditIntentPlanned: discovery.targetFound,
    auditResultPlanned: discovery.targetFound,
    idempotencyPlanned: discovery.targetFound && precondition.preconditionCaptured,
    disabledWritePathActive,
    denials,
  };

  return {
    ok,
    pilotStatus: ok ? "DRY_RUN_PASS" : "DRY_RUN_NO_GO",
    wouldWrite,
    actualWrite: false,
    action: "needs_changes",
    before: {
      registrationStatus: discovery.targetFound
        ? "pending_review"
        : null,
    },
    plannedAfter: {
      registrationStatus: discovery.targetFound ? "needs_changes" : null,
    },
    productionApplyInvocationCount: 0,
    writeFlagsRemainFalse: flagsAfter,
    observability,
  };
}

/** §17 PASS gate helper — pure check over observability. */
export function phase5FDryRunPassGatesMet(
  obs: Phase5FDryRunObservabilitySummary,
): boolean {
  return (
    obs.overallStatus === "DRY_RUN_PASS" &&
    obs.targetFound === true &&
    obs.targetSynthetic === true &&
    obs.operationalDriver === true &&
    obs.currentState === "pending_review" &&
    obs.plannedState === "needs_changes" &&
    obs.activeTrip === false &&
    obs.financeImpact === "none" &&
    obs.authDependency === false &&
    obs.rbacPass === true &&
    obs.scopePass === true &&
    obs.preconditionCaptured === true &&
    obs.plannedDiffValid === true &&
    obs.wouldWrite === true &&
    obs.actualWrite === false &&
    obs.totalProductionWrites === 0 &&
    obs.allWriteFlagsFalseAfterRun === true &&
    obs.productionApplyInvocationCount === 0
  );
}

/** Re-export exact before/after for report consumers. */
export const PHASE_5F_PLANNED_ACTION = {
  action: "needs_changes" as const,
  before: PHASE_5E_EXACT_BEFORE_STATE.registrationStatus,
  after: PHASE_5E_EXACT_AFTER_STATE.registrationStatus,
};
