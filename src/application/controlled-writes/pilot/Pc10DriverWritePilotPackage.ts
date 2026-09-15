/**
 * PC-10 — Driver-only staged write pilot PACKAGE (preparation only).
 *
 * HARD STOP: Do not arm Production write flags. Do not execute the pilot.
 * Output gate: WRITE_PILOT_READY_FOR_OPERATOR_APPROVAL.
 */

import { assessSafestFuturePilot } from "@/application/controlled-writes/ControlledWritePilotReadiness";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET } from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";

export const PC10_WRITE_PILOT_EXECUTED = false as const;
export const PC10_INITIAL_CUTOVER_MODE = "READ_ONLY" as const;

/** Preferred first action — reversible, non-destructive legal transition. */
export const PC10_DRIVER_PILOT_RECOMMENDED_ACTION = "needs_changes" as const;

/**
 * Preferred target strategy: dedicated synthetic / non-commercial fixture only.
 * Operator must confirm a live safe synthetic id before arming — never pick
 * commercial drivers.
 */
export const PC10_DRIVER_PILOT_PREFERRED_TARGET_STRATEGY =
  "dedicated_synthetic_pending_review_only" as const;

/** Offline representative only — NOT an auto-selected live Production target. */
export const PC10_DRIVER_PILOT_OFFLINE_REPRESENTATIVE_ID =
  PHASE_5F_PLANNED_SYNTHETIC_ID_NOT_AUTO_TARGET;

export type Pc10DriverWritePilotPackage = {
  schemaVersion: "pc10-driver-write-pilot/v1";
  preparedAtPhase: "PC-10";
  executed: false;
  productionArmed: false;
  writeFlagsRemainFalse: true;
  writePilotReadyForOperatorApproval: true;
  cutoverMode: typeof PC10_INITIAL_CUTOVER_MODE;
  resource: "driver";
  action: typeof PC10_DRIVER_PILOT_RECOMMENDED_ACTION;
  fromState: "pending_review";
  toState: "needs_changes";
  rollbackLegalTransition: "resubmit_to_pending_review";
  targetStrategy: typeof PC10_DRIVER_PILOT_PREFERRED_TARGET_STRATEGY;
  offlineRepresentativeId: typeof PC10_DRIVER_PILOT_OFFLINE_REPRESENTATIVE_ID;
  liveTargetId: "PENDING_OPERATOR_SAFE_SYNTHETIC_ONLY";
  forbiddenTargets: readonly string[];
  killSwitches: readonly string[];
  armingOrder: readonly string[];
  snapshotChecklist: readonly string[];
  rollbackChecklist: readonly string[];
  stillOffAfterPilotPrep: readonly string[];
  prerequisites: readonly string[];
  rationale: string;
};

/**
 * Build the operator-approval package. Never mutates Production.
 */
export function buildPc10DriverWritePilotPackage(): Pc10DriverWritePilotPackage {
  const assessment = assessSafestFuturePilot();

  if (CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled !== false) {
    throw new Error("PC10_REFUSE: productionWritesEnabled must remain false");
  }
  if (PC10_WRITE_PILOT_EXECUTED !== false) {
    throw new Error("PC10_REFUSE: pilot must not be marked executed in PC-10");
  }

  return {
    schemaVersion: "pc10-driver-write-pilot/v1",
    preparedAtPhase: "PC-10",
    executed: false,
    productionArmed: false,
    writeFlagsRemainFalse: true,
    writePilotReadyForOperatorApproval: true,
    cutoverMode: PC10_INITIAL_CUTOVER_MODE,
    resource: "driver",
    action: PC10_DRIVER_PILOT_RECOMMENDED_ACTION,
    fromState: "pending_review",
    toState: "needs_changes",
    rollbackLegalTransition: "resubmit_to_pending_review",
    targetStrategy: PC10_DRIVER_PILOT_PREFERRED_TARGET_STRATEGY,
    offlineRepresentativeId: PC10_DRIVER_PILOT_OFFLINE_REPRESENTATIVE_ID,
    liveTargetId: "PENDING_OPERATOR_SAFE_SYNTHETIC_ONLY",
    forbiddenTargets: [
      "any_commercial_driver",
      "any_active_trip_driver",
      "any_finance_linked_driver",
      "agent_or_admin_contaminated_user",
      "customer_or_geography_or_users_writes",
    ],
    killSwitches: [
      "GLOBAL_PRODUCTION_WRITE_ENABLED=false",
      "PRODUCTION_WRITE_ENABLED=false",
      "DRIVER_WRITE_ENABLED=false",
      "NEXT_PUBLIC_CONTROLLED_WRITES_UI=false",
      "AGENT_WRITE_ENABLED=false",
      "CUSTOMER_WRITE_ENABLED=false",
      "CUSTOMER_AUTH_WRITE_ENABLED=false",
      "GEOGRAPHY_WRITE_ENABLED=false",
      "FINANCE_WRITE_ENABLED=false",
    ],
    armingOrder: [
      "1. Operator confirms READ_ONLY_PRODUCTION_GO on default + custom URLs",
      "2. Operator selects LIVE safe synthetic pending_review driver (never commercial)",
      "3. Snapshot before-state + audit baseline",
      "4. Temporarily set NEXT_PUBLIC_CONTROLLED_WRITES_UI=true (chrome only)",
      "5. Arm GLOBAL_PRODUCTION_WRITE_ENABLED + PRODUCTION_WRITE_ENABLED + DRIVER_WRITE_ENABLED only",
      "6. Execute single needs_changes with idempotency-key + expectedCurrentState",
      "7. Verify audit INTENT+RESULT; confirm zero finance/trip/auth side effects",
      "8. Immediately restore all write flags + UI chrome to false OR complete legal rollback",
    ],
    snapshotChecklist: [
      "driver id + registrationStatus + accountEnabled + mappingStatus",
      "active trip count / readiness guards",
      "audit cursor / last consolidated audit id",
      "Vercel deployment URL + git SHA",
      "env write-flag truth table (all false before arm)",
    ],
    rollbackChecklist: [
      "Prefer legal reverse only (needs_changes → pending_review via allowlisted resubmit path)",
      "Do not silent-patch Firestore fields outside Controlled Writes",
      "If unsure: set all write kill-switches false and fall back to Legacy RO Admin",
      "Do not delete Production documents as cleanup",
    ],
    stillOffAfterPilotPrep: [
      "AGENT_WRITE_ENABLED",
      "CUSTOMER_WRITE_ENABLED",
      "CUSTOMER_AUTH_WRITE_ENABLED",
      "GEOGRAPHY_WRITE_ENABLED",
      "FINANCE_WRITE_ENABLED",
      "Users/Roles claims writes",
    ],
    prerequisites: assessment.prerequisites,
    rationale: assessment.rationale,
  };
}

export function assertPc10PilotNotExecuted(): void {
  if (PC10_WRITE_PILOT_EXECUTED !== false) {
    throw new Error("PILOT_EXECUTED must remain NO throughout PC-10");
  }
  const pkg = buildPc10DriverWritePilotPackage();
  if (pkg.executed !== false || pkg.productionArmed !== false) {
    throw new Error("PC10 pilot package must remain unexecuted and unarmed");
  }
}
