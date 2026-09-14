/**
 * Phase 5D — Pilot readiness assessment ONLY.
 * Does NOT execute Production Pilot. Does NOT create synthetic records.
 */

export type PilotCandidate = {
  resource: "driver" | "agent" | "customer";
  action: string;
  blastRadius: "low" | "medium" | "high";
  reversibility: "high" | "medium" | "low";
  authImpact: boolean;
  tripImpact: boolean;
  financialImpact: boolean;
  oneCountryAgentInvariantRisk: boolean;
  notes: string;
};

export const PILOT_CANDIDATES: readonly PilotCandidate[] = [
  {
    resource: "driver",
    action: "needs_changes",
    blastRadius: "low",
    reversibility: "high",
    authImpact: false,
    tripImpact: false,
    financialImpact: false,
    oneCountryAgentInvariantRisk: false,
    notes:
      "Moves pending_review→needs_changes on synthetic driver; driver can resubmit; no account disable.",
  },
  {
    resource: "driver",
    action: "approve",
    blastRadius: "medium",
    reversibility: "medium",
    authImpact: false,
    tripImpact: false,
    financialImpact: false,
    oneCountryAgentInvariantRisk: false,
    notes: "Enables operational driver path; higher blast than needs_changes.",
  },
  {
    resource: "agent",
    action: "activate",
    blastRadius: "high",
    reversibility: "medium",
    authImpact: false,
    tripImpact: false,
    financialImpact: false,
    oneCountryAgentInvariantRisk: true,
    notes: "One-country-one-active invariant; deny-if-other-active; higher risk.",
  },
  {
    resource: "customer",
    action: "disable",
    blastRadius: "medium",
    reversibility: "high",
    authImpact: false,
    tripImpact: false,
    financialImpact: false,
    oneCountryAgentInvariantRisk: false,
    notes:
      "App-state only (Auth sync off); reversible via reactivate; still user-facing.",
  },
] as const;

export type PilotReadinessAssessment = {
  recommendedResource: "driver";
  recommendedAction: "needs_changes";
  executed: false;
  syntheticRecordCreated: false;
  productionMutated: false;
  prerequisites: readonly string[];
  rationale: string;
};

/**
 * Recommend safest FIRST future Pilot — assessment only.
 */
export function assessSafestFuturePilot(): PilotReadinessAssessment {
  return {
    recommendedResource: "driver",
    recommendedAction: "needs_changes",
    executed: false,
    syntheticRecordCreated: false,
    productionMutated: false,
    prerequisites: [
      "dedicated synthetic/test Driver record in Production (NOT created in Phase 5D)",
      "known rollback path (resubmit_to_review / reverse to pending_review)",
      "single resource = driver",
      "single mutation = needs_changes",
      "explicit operator command with verified actor",
      "exact expected before state = pending_review + preconditionToken",
      "exact expected after state = needs_changes",
      "audit INTENT+RESULT verification",
      "zero finance impact confirmed",
      "zero active trip confirmed",
      "no real user impact (synthetic only)",
      "GLOBAL_PRODUCTION_WRITE_ENABLED ∧ PRODUCTION_WRITE_ENABLED ∧ DRIVER_WRITE_ENABLED explicitly approved in a later phase",
      "controlledWritesEnabled remains gated until Pilot activation phase",
    ],
    rationale:
      "Lowest blast radius among allowlisted actions: no Auth, no finance, no trip mutation, no Agent uniqueness risk, highly reversible via driver resubmit. Prefer over approve/suspend/activate/disable for first Pilot.",
  };
}
