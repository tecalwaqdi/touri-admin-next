/**
 * Phase 5M — safe apply summary (no PII / no uid / no tokens).
 */

import type { Phase5MExpectedWriteCounts } from "@/application/controlled-writes/pilot/Phase5MExpectedWriteCounts";

export type Phase5MApplyOverallStatus =
  | "SKIPPED"
  | "PENDING_OPERATOR"
  | "GATED_REFUSED"
  | "IAM_PREFLIGHT_FAILED"
  | "PILOT_PRECONDITION_FAILED"
  | "PILOT_DIFF_VIOLATION"
  | "PILOT_ALREADY_APPLIED"
  | "PARTIAL_FAILURE"
  | "PHASE5M_DRIVER_PILOT_WRITE_PASS"
  | "PHASE5M_DRIVER_PILOT_WRITE_NO_GO";

export type Phase5MApplySafeSummary = {
  overallStatus: Phase5MApplyOverallStatus;
  harnessArmed: boolean;
  applyAttempted: boolean;
  pilotWriteProven: boolean;
  targetFound: boolean;
  synthetic: boolean | null;
  operationalDriver: boolean | null;
  currentState: string | null;
  afterState: string | null;
  rbacPass: boolean | null;
  scopePass: boolean | null;
  transitionAllowed: boolean | null;
  preconditionAvailable: boolean | null;
  hasActiveTrip: boolean | "unknown" | null;
  financialImpact: "none" | "unknown" | "present" | null;
  plannedDiffValid: boolean | null;
  exactDomainDiff: { registration_status: "needs_changes" } | null;
  idempotencyKeyLogical: string | null;
  alreadyApplied: boolean;
  iamPreflightStatus: "IAM_PREFLIGHT_PASS" | "IAM_PREFLIGHT_FAILED" | null;
  iamGranted: readonly string[];
  iamMissing: readonly string[];
  operatorAuthWritePermissionRequired: false;
  authTriggerExpected: true;
  expectedClaimsChange: false;
  writeOrderDocumented: true;
  exactWriteCountsKnown: boolean;
  exactExpectedWriteCounts: Phase5MExpectedWriteCounts | null;
  actualDriverDomainWrites: number;
  actualAuditIntentWrites: number;
  actualAuditResultWrites: number;
  actualIdempotencyWrites: number;
  actualAuthClaimWrites: number;
  financeWrites: number;
  tripWrites: number;
  agentWrites: number;
  customerWrites: number;
  productionWrites: number;
  actorVerified: boolean | null;
  actorRole: string | null;
  forbiddenFieldsUnchanged: boolean | null;
  claimsVerifyOk: boolean | null;
  sideEffectsZero: boolean | null;
  partialFailureCode: string | null;
  denials: readonly string[];
  blocker?: string;
  liveApplyAttempted: boolean;
};

export function emptyPhase5MApplySafeSummary(
  overrides?: Partial<Phase5MApplySafeSummary>,
): Phase5MApplySafeSummary {
  return {
    overallStatus: "SKIPPED",
    harnessArmed: false,
    applyAttempted: false,
    pilotWriteProven: false,
    targetFound: false,
    synthetic: null,
    operationalDriver: null,
    currentState: null,
    afterState: null,
    rbacPass: null,
    scopePass: null,
    transitionAllowed: null,
    preconditionAvailable: null,
    hasActiveTrip: null,
    financialImpact: null,
    plannedDiffValid: null,
    exactDomainDiff: null,
    idempotencyKeyLogical: null,
    alreadyApplied: false,
    iamPreflightStatus: null,
    iamGranted: [],
    iamMissing: [],
    operatorAuthWritePermissionRequired: false,
    authTriggerExpected: true,
    expectedClaimsChange: false,
    writeOrderDocumented: true,
    exactWriteCountsKnown: true,
    exactExpectedWriteCounts: null,
    actualDriverDomainWrites: 0,
    actualAuditIntentWrites: 0,
    actualAuditResultWrites: 0,
    actualIdempotencyWrites: 0,
    actualAuthClaimWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    productionWrites: 0,
    actorVerified: null,
    actorRole: null,
    forbiddenFieldsUnchanged: null,
    claimsVerifyOk: null,
    sideEffectsZero: null,
    partialFailureCode: null,
    denials: [],
    liveApplyAttempted: false,
    ...overrides,
  };
}

export function evaluatePhase5MWritePassConditions(
  s: Phase5MApplySafeSummary,
): { ok: boolean; denials: string[] } {
  const denials: string[] = [];
  if (!s.pilotWriteProven) denials.push("pilotWriteProven");
  if (s.actualDriverDomainWrites !== 1) denials.push("driverDomainWrites!=1");
  if (s.actualAuditIntentWrites !== 1) denials.push("auditIntentWrites!=1");
  if (s.actualAuditResultWrites !== 1) denials.push("auditResultWrites!=1");
  if (s.actualIdempotencyWrites !== 1) denials.push("idempotencyWrites!=1");
  if (s.afterState !== "needs_changes") denials.push("afterState");
  if (s.forbiddenFieldsUnchanged !== true)
    denials.push("forbiddenFieldsUnchanged");
  if (s.financeWrites !== 0) denials.push("financeWrites");
  if (s.tripWrites !== 0) denials.push("tripWrites");
  if (s.agentWrites !== 0) denials.push("agentWrites");
  if (s.customerWrites !== 0) denials.push("customerWrites");
  if (s.sideEffectsZero !== true) denials.push("sideEffectsZero");
  return { ok: denials.length === 0, denials };
}
