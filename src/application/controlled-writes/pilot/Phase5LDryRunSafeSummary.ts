/**
 * Phase 5L — safe dry-run summary (no UID / token / PII).
 */

import type { Phase5LExactFutureWriteCounts } from "@/application/controlled-writes/pilot/Phase5LExpectedWriteCounts";

export type Phase5LOverallStatus =
  | "SKIPPED"
  | "PENDING_OPERATOR"
  | "PHASE5L_DRIVER_PILOT_DRY_RUN_PASS"
  | "PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO";

export type Phase5LDryRunSafeSummary = {
  overallStatus: Phase5LOverallStatus;
  dryRunExecuted: boolean;

  targetFound: boolean;
  synthetic: boolean;
  currentState: string | null;
  plannedState: "needs_changes" | null;

  rbacPass: boolean;
  scopePass: boolean;
  transitionAllowed: boolean;
  preconditionAvailable: boolean;

  hasActiveTrip: boolean | "unknown";
  financialImpact: "none" | "present" | "unknown";

  plannedDiffValid: boolean;

  expectedAuthTrigger: boolean;
  expectedClaimsChange: boolean;

  idempotencyReady: boolean;
  auditPlanReady: boolean;
  exactWriteCountsKnown: boolean;

  wouldApplyDriverMutation: boolean;
  actualDriverWrites: 0;
  authWrites: 0;
  financeWrites: 0;
  tripWrites: 0;
  agentWrites: 0;
  customerWrites: 0;
  productionWrites: 0;

  allWriteFlagsFalseAfterRun: boolean;

  /** Planned future counts (not executed). */
  exactFutureWriteCounts?: Phase5LExactFutureWriteCounts;

  operationalDriver?: boolean;
  actorRole?: string | null;
  actorVerified?: boolean;
  productionReads?: number;
  liveDryRunAttempted?: boolean;
  denials?: readonly string[];
  blocker?: string;
};

export function emptyPhase5LDryRunSafeSummary(
  overrides?: Partial<Phase5LDryRunSafeSummary>,
): Phase5LDryRunSafeSummary {
  return {
    overallStatus: "SKIPPED",
    dryRunExecuted: false,
    targetFound: false,
    synthetic: false,
    currentState: null,
    plannedState: null,
    rbacPass: false,
    scopePass: false,
    transitionAllowed: false,
    preconditionAvailable: false,
    hasActiveTrip: "unknown",
    financialImpact: "unknown",
    plannedDiffValid: false,
    expectedAuthTrigger: false,
    expectedClaimsChange: false,
    idempotencyReady: false,
    auditPlanReady: false,
    exactWriteCountsKnown: false,
    wouldApplyDriverMutation: false,
    actualDriverWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    productionWrites: 0,
    allWriteFlagsFalseAfterRun: true,
    operationalDriver: false,
    actorRole: null,
    actorVerified: false,
    productionReads: 0,
    liveDryRunAttempted: false,
    denials: [],
    ...overrides,
  };
}

/**
 * PASS conditions from Phase 5L §16.
 */
export function evaluatePhase5LPassConditions(
  s: Pick<
    Phase5LDryRunSafeSummary,
    | "targetFound"
    | "synthetic"
    | "currentState"
    | "plannedState"
    | "rbacPass"
    | "scopePass"
    | "transitionAllowed"
    | "preconditionAvailable"
    | "hasActiveTrip"
    | "financialImpact"
    | "plannedDiffValid"
    | "idempotencyReady"
    | "auditPlanReady"
    | "exactWriteCountsKnown"
    | "actualDriverWrites"
    | "authWrites"
    | "financeWrites"
    | "tripWrites"
    | "productionWrites"
  >,
): { ok: boolean; denials: string[] } {
  const denials: string[] = [];
  if (!s.targetFound) denials.push("targetFound");
  if (!s.synthetic) denials.push("synthetic");
  if (s.currentState !== "pending_review") denials.push("currentState");
  if (s.plannedState !== "needs_changes") denials.push("plannedState");
  if (!s.rbacPass) denials.push("rbacPass");
  if (!s.scopePass) denials.push("scopePass");
  if (!s.transitionAllowed) denials.push("transitionAllowed");
  if (!s.preconditionAvailable) denials.push("preconditionAvailable");
  if (s.hasActiveTrip !== false) denials.push("hasActiveTrip");
  if (s.financialImpact !== "none") denials.push("financialImpact");
  if (!s.plannedDiffValid) denials.push("plannedDiffValid");
  if (!s.idempotencyReady) denials.push("idempotencyReady");
  if (!s.auditPlanReady) denials.push("auditPlanReady");
  if (!s.exactWriteCountsKnown) denials.push("exactWriteCountsKnown");
  if (s.actualDriverWrites !== 0) denials.push("actualDriverWrites");
  if (s.authWrites !== 0) denials.push("authWrites");
  if (s.financeWrites !== 0) denials.push("financeWrites");
  if (s.tripWrites !== 0) denials.push("tripWrites");
  if (s.productionWrites !== 0) denials.push("productionWrites");
  return { ok: denials.length === 0, denials };
}
