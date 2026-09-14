/**
 * Phase 5E — Pilot gates, isolation, actor, flags, write counts, rollback,
 * observability, execution sequence (PREPARATION ONLY — no execution).
 */

import {
  CONTROLLED_WRITES_ENABLEMENT,
} from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  AUTH_REQUIRED_FOR_PILOT_TARGET,
  PHASE_5E_EXPECTED_PROJECT_ID,
  PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
  assertPilotTargetIsSynthetic,
} from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";
import {
  PHASE_5E_EXACT_AFTER_STATE,
  PHASE_5E_EXACT_BEFORE_STATE,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotDiffContract";
import { isProvenDriverTransition } from "@/application/controlled-writes/drivers/DriverStateMachine";

/** First Pilot actor — super_admin only. */
export const PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED = "super_admin" as const;

export type Phase5EPilotGateInput = {
  PHASE5E_DRIVER_PILOT?: string;
  projectId?: string;
  pilotDriverId?: string;
  expectedBeforeState?: string;
  preconditionToken?: string;
  operatorIdentity?: string;
  actorRole?: string;
  /** Optional doc fields for synthetic classification. */
  targetData?: Record<string, unknown>;
};

export type Phase5EPilotGateDenialCode =
  | "PHASE5E_DRIVER_PILOT_SKIP"
  | "PILOT_PROJECT_ID_REQUIRED"
  | "PILOT_PROJECT_ID_MISMATCH"
  | "PILOT_DRIVER_ID_REQUIRED"
  | "PILOT_TARGET_NOT_SYNTHETIC"
  | "PILOT_BEFORE_STATE_REQUIRED"
  | "PILOT_BEFORE_STATE_MISMATCH"
  | "PILOT_PRECONDITION_TOKEN_REQUIRED"
  | "PILOT_OPERATOR_IDENTITY_REQUIRED"
  | "PILOT_ACTOR_NOT_SUPER_ADMIN"
  | "PILOT_WRITE_FLAGS_MUST_REMAIN_FALSE"
  | "PILOT_ENABLEMENT_MUST_REMAIN_FALSE";

export type Phase5EPilotGateResult =
  | {
      ok: true;
      gated: false;
      pilotDriverId: string;
      projectId: string;
      operatorIdentity: string;
    }
  | {
      ok: false;
      gated: true;
      code: Phase5EPilotGateDenialCode;
      message: string;
    };

/**
 * Single-use gate. Default SKIP unless PHASE5E_DRIVER_PILOT=1 and all
 * operator requirements present. Does NOT enable write flags.
 */
export function evaluatePhase5EPilotGate(
  input: Phase5EPilotGateInput,
  writeFlags: {
    GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
    PRODUCTION_WRITE_ENABLED: boolean;
    DRIVER_WRITE_ENABLED: boolean;
    controlledWritesEnabled: boolean;
    productionWritesEnabled: boolean;
  } = {
    GLOBAL_PRODUCTION_WRITE_ENABLED: false,
    PRODUCTION_WRITE_ENABLED: false,
    DRIVER_WRITE_ENABLED: false,
    controlledWritesEnabled: CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled,
    productionWritesEnabled: CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled,
  },
): Phase5EPilotGateResult {
  if (input.PHASE5E_DRIVER_PILOT !== "1") {
    return {
      ok: false,
      gated: true,
      code: "PHASE5E_DRIVER_PILOT_SKIP",
      message: "PHASE5E_DRIVER_PILOT default SKIP (require =1)",
    };
  }

  // Preparation posture: even with gate=1, write flags must stay false in 5E.
  // Future real Pilot activation is a separate operator step after dry-run review.
  if (
    writeFlags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    writeFlags.PRODUCTION_WRITE_ENABLED ||
    writeFlags.DRIVER_WRITE_ENABLED
  ) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_WRITE_FLAGS_MUST_REMAIN_FALSE",
      message:
        "Phase 5E preparation refuses when write flags are true — fail-closed",
    };
  }
  if (
    writeFlags.controlledWritesEnabled !== false ||
    writeFlags.productionWritesEnabled !== false
  ) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_ENABLEMENT_MUST_REMAIN_FALSE",
      message: "controlledWritesEnabled/productionWritesEnabled must remain false",
    };
  }

  const projectId = input.projectId?.trim() ?? "";
  if (!projectId) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_PROJECT_ID_REQUIRED",
      message: "project ID required",
    };
  }
  if (projectId !== PHASE_5E_EXPECTED_PROJECT_ID) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_PROJECT_ID_MISMATCH",
      message: `projectId must be ${PHASE_5E_EXPECTED_PROJECT_ID}`,
    };
  }

  const pilotDriverId = input.pilotDriverId?.trim() ?? "";
  if (!pilotDriverId) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_DRIVER_ID_REQUIRED",
      message: "PILOT_DRIVER_ID required",
    };
  }
  const synthetic = assertPilotTargetIsSynthetic({
    driverId: pilotDriverId,
    data: input.targetData ?? { is_test: true, functional_test: true },
  });
  if (!synthetic.ok) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_TARGET_NOT_SYNTHETIC",
      message: synthetic.message,
    };
  }

  const before = input.expectedBeforeState?.trim() ?? "";
  if (!before) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_BEFORE_STATE_REQUIRED",
      message: "exact before state required (pending_review)",
    };
  }
  if (before !== PHASE_5E_EXACT_BEFORE_STATE.registrationStatus) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_BEFORE_STATE_MISMATCH",
      message: `expected before state ${PHASE_5E_EXACT_BEFORE_STATE.registrationStatus}, got ${before}`,
    };
  }

  if (!input.preconditionToken?.trim()) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_PRECONDITION_TOKEN_REQUIRED",
      message: "preconditionToken required",
    };
  }

  const operatorIdentity = input.operatorIdentity?.trim() ?? "";
  if (!operatorIdentity) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_OPERATOR_IDENTITY_REQUIRED",
      message: "operator identity required",
    };
  }

  if (input.actorRole !== PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED) {
    return {
      ok: false,
      gated: true,
      code: "PILOT_ACTOR_NOT_SUPER_ADMIN",
      message: "first Pilot requires super_admin only",
    };
  }

  return {
    ok: true,
    gated: false,
    pilotDriverId,
    projectId,
    operatorIdentity,
  };
}

/** Isolation: only Driver + audit/idempotency may change in a future Pilot. */
export const PHASE_5E_ISOLATION_GUARANTEES = {
  financeWrites: 0,
  authWrites: 0,
  tripWrites: 0,
  agentWrites: 0,
  customerWrites: 0,
  allowedFutureMutationSurfaces: [
    "driver_domain",
    "audit",
    "idempotency",
  ] as const,
} as const;

/**
 * Expected write counts for a future REAL Pilot (not Phase 5E).
 * Dry-run / preparation: all zeros.
 */
export const PHASE_5E_EXPECTED_WRITE_COUNTS_FUTURE_PILOT = {
  driverDomain: 1,
  auditIntent: 1,
  auditResult: 1,
  idempotency: 1,
  auth: 0,
  finance: 0,
  trip: 0,
  agent: 0,
  customer: 0,
} as const;

export const PHASE_5E_EXPECTED_WRITE_COUNTS_PREPARATION = {
  driverDomain: 0,
  auditIntent: 0,
  auditResult: 0,
  idempotency: 0,
  auth: 0,
  finance: 0,
  trip: 0,
  agent: 0,
  customer: 0,
  productionWrites: 0,
} as const;

/** Flag activation plan — all false now; temporary window; fail-closed after one attempt. */
export const PHASE_5E_FLAG_ACTIVATION_PLAN = {
  current: {
    GLOBAL_PRODUCTION_WRITE_ENABLED: false,
    PRODUCTION_WRITE_ENABLED: false,
    DRIVER_WRITE_ENABLED: false,
    AGENT_WRITE_ENABLED: false,
    CUSTOMER_WRITE_ENABLED: false,
    FINANCE_WRITE_ENABLED: false,
    CUSTOMER_AUTH_WRITE_ENABLED: false,
    controlledWritesEnabled: false,
    productionWritesEnabled: false,
  },
  temporaryWindow: {
    enableOnly: [
      "GLOBAL_PRODUCTION_WRITE_ENABLED",
      "PRODUCTION_WRITE_ENABLED",
      "DRIVER_WRITE_ENABLED",
    ] as const,
    neverEnable: [
      "AGENT_WRITE_ENABLED",
      "CUSTOMER_WRITE_ENABLED",
      "FINANCE_WRITE_ENABLED",
      "CUSTOMER_AUTH_WRITE_ENABLED",
    ] as const,
    maxAttempts: 1,
    failClosedAfterAttempt: true,
    autoProgression: false,
  },
  deactivation: {
    immediatelyAfterOnePilot: true,
    restoreAllFalse: true,
    verifyDisabledBeforeExit: true,
  },
} as const;

/**
 * Rollback plan — do not invent; do not execute.
 * needs_changes→pending_review is proven as resubmit_to_review but NOT an
 * admin Controlled Write command in Phase 5A.
 */
export type Phase5ERollbackPlan = {
  adminNeedsChangesToPendingReviewSupported: false;
  provenTransitionExists: boolean;
  provenAction: "resubmit_to_review";
  strategy:
    | "driver_resubmit_if_auth_app_available"
    | "controlled_recovery_registration_status_only";
  recoveryAllowlist: readonly ["registration_status"];
  recoveryTargetValue: "pending_review";
  executeInPhase5E: false;
  notes: string;
};

export function buildPhase5ERollbackPlan(): Phase5ERollbackPlan {
  const proven = isProvenDriverTransition(
    "needs_changes",
    "pending_review",
    "resubmit_to_review",
  );
  return {
    adminNeedsChangesToPendingReviewSupported: false,
    provenTransitionExists: proven,
    provenAction: "resubmit_to_review",
    strategy: AUTH_REQUIRED_FOR_PILOT_TARGET
      ? "driver_resubmit_if_auth_app_available"
      : "controlled_recovery_registration_status_only",
    recoveryAllowlist: ["registration_status"],
    recoveryTargetValue: "pending_review",
    executeInPhase5E: false,
    notes:
      "Admin Controlled Write commands do not expose needs_changes→pending_review. " +
      "Rollback uses proven resubmit_to_review semantics via (1) Legacy driver app " +
      "resubmit when Auth/app path exists, OR (2) operator-controlled recovery that " +
      "restores ONLY registration_status=pending_review under separate approval. " +
      "Do not invent a new admin command in Phase 5E. Do not execute rollback here.",
  };
}

/** Zero active trip + zero financial impact checks (defined, not executed). */
export const PHASE_5E_ZERO_IMPACT_CHECKS = {
  activeTrip: {
    requiredTripState: "idle" as const,
    denyIfBusy: true,
    tripWrites: 0,
    checkFields: ["tripState", "mndon_newacc", "on_trip"] as const,
  },
  financialImpact: {
    financeWrites: 0,
    mustNotTouch: [
      "total_mndob",
      "total_app",
      "Outstandingonlinepayment",
      "ipanBank",
      "bankIdAcc",
    ] as const,
  },
} as const;

/** Precondition capture + unique idempotency key plan. */
export const PHASE_5E_PRECONDITION_AND_IDEMPOTENCY_PLAN = {
  capture: [
    "driverId",
    "registrationStatus===pending_review",
    "preconditionToken",
    "isOperationalDriver===true",
    "tripState===idle",
    "accountEnabled",
    "countryId",
    "synthetic marker classification",
  ] as const,
  idempotencyKeyPattern:
    "phase5e_drv_nc_{pilotDriverId}_{operatorUid}_{utcDate}_{nonce}",
  uniquePerAttempt: true,
  auditExpectationsFuturePilot: {
    productionWriteExecuted: true,
    intentAndResultRequired: true,
    noPii: true,
  },
  auditExpectationsPreparation: {
    productionWriteExecuted: false,
    writes: 0,
  },
} as const;

/** Observability Pilot summary shape — no PII. */
export type Phase5EPilotObservabilitySummary = {
  phase: "5E";
  mode: "preparation" | "dry_run" | "pilot_future";
  overallStatus: "SKIPPED" | "PLANNED" | "DRY_RUN_OK" | "NO_GO" | "PASS" | "FAIL";
  projectFingerprint: string;
  recommendedAction: "needs_changes";
  resource: "driver";
  pilotDriverIdHash?: string;
  beforeState?: string;
  afterStateExpected?: string;
  wouldWrite: boolean;
  actualWrite: boolean;
  writeFlags: {
    GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
    PRODUCTION_WRITE_ENABLED: boolean;
    DRIVER_WRITE_ENABLED: boolean;
  };
  writeCounts: {
    driverDomain: number;
    audit: number;
    idempotency: number;
    auth: number;
    finance: number;
    trip: number;
  };
  AUTH_REQUIRED_FOR_PILOT_TARGET: boolean;
  syntheticTarget: boolean;
  actorRoleRequired: typeof PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED;
  productionWriteExecuted: boolean;
  /** Forbidden: phone, email, displayName, nationalId, IBAN, raw tokens. */
};

export function buildPreparationObservabilitySummary(): Phase5EPilotObservabilitySummary {
  return {
    phase: "5E",
    mode: "preparation",
    overallStatus: "PLANNED",
    projectFingerprint: PHASE_5E_EXPECTED_PROJECT_ID,
    recommendedAction: "needs_changes",
    resource: "driver",
    beforeState: PHASE_5E_EXACT_BEFORE_STATE.registrationStatus,
    afterStateExpected: PHASE_5E_EXACT_AFTER_STATE.registrationStatus,
    wouldWrite: false,
    actualWrite: false,
    writeFlags: {
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
    },
    writeCounts: {
      driverDomain: 0,
      audit: 0,
      idempotency: 0,
      auth: 0,
      finance: 0,
      trip: 0,
    },
    AUTH_REQUIRED_FOR_PILOT_TARGET,
    syntheticTarget: true,
    actorRoleRequired: PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED,
    productionWriteExecuted: false,
  };
}

/**
 * Future execution sequence — documented only; no auto progression.
 */
export const PHASE_5E_FUTURE_EXECUTION_SEQUENCE = [
  "1_dry_run_PHASE5E_DRIVER_PILOT_DRY_RUN=1 (read/validate/plan, writes=0)",
  "2_operator_review_of_dry_run_summary",
  "3_narrow_enable_GLOBAL_and_PRODUCTION_and_DRIVER_WRITE_only_temporary",
  "4_one_pilot_PHASE5E_DRIVER_PILOT=1_single_attempt",
  "5_immediately_disable_all_write_flags",
  "6_verify_after_state_audit_idempotency_isolation",
] as const;

export const PHASE_5E_SYNTHETIC_ID_REFERENCE =
  PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY;
