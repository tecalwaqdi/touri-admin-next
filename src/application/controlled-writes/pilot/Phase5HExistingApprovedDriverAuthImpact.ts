/**
 * Phase 5H pivot — Auth / Cloud Function side effects for approved↔suspended.
 * READ-ONLY reuse of Phase 5H Legacy evidence (ara-ban Functions).
 * Does NOT mutate Auth. Does NOT write Production.
 *
 * Key correction vs AUTH_REQUIRED_FOR_PILOT_TARGET=false (5E/5F Firestore-path
 * claim): Production `syncUserClaimsOnWrite` fires on ANY user/{uid} write where
 * after.exists and ALWAYS calls admin.auth().setCustomUserClaims — including
 * registration_status-only patches for suspend / approve rollback.
 */

import {
  PHASE_5H_USER_DOC_TRIGGER_ANALYSIS,
  type Phase5HUserDocTriggerRow,
} from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";

export type Phase5HSideEffectClass =
  | "harmless"
  | "controlled"
  | "high-risk"
  | "none";

export type Phase5HUpdateTriggerRow = {
  exportName: string;
  firesOnUserDocUpdate: boolean;
  effect: string;
  classification: Phase5HSideEffectClass;
  authDependency: boolean;
  financeDependency: boolean;
  tripDependency: boolean;
  evidence: string;
};

/**
 * Closed inventory for user/{uid} UPDATE (approved→suspended / suspended→approved).
 * Source: ara-ban admin/Admi/firebase/functions/index.js + panel_claims.js.
 */
export const PHASE_5H_APPROVED_UPDATE_TRIGGER_ANALYSIS: readonly Phase5HUpdateTriggerRow[] =
  [
    {
      exportName: "syncUserClaimsOnWrite",
      firesOnUserDocUpdate: true,
      effect:
        "firestore.onWrite user/{uid}: when after.exists → syncClaimsForUid → " +
        "deriveClaimsFromUserData → ALWAYS admin.auth().setCustomUserClaims(uid, claims). " +
        "registration_status / actev_mndob are NOT claim inputs, but Auth write still occurs. " +
        "If document id is not a real Auth UID → auth/user-not-found (uncontrolled CF failure).",
      classification: "high-risk",
      authDependency: true,
      financeDependency: false,
      tripDependency: false,
      evidence:
        "ara-ban admin/Admi/firebase/functions/index.js syncUserClaimsOnWrite + " +
        "panel_claims.js deriveClaimsFromUserData (no registration_status branch)",
    },
    {
      exportName: "refreshMyClaims",
      firesOnUserDocUpdate: false,
      effect: "Callable only — not auto-invoked on Firestore update.",
      classification: "none",
      authDependency: true,
      financeDependency: false,
      tripDependency: false,
      evidence: "index.js refreshMyClaims",
    },
    {
      exportName: "notifyAdminsDriverApplication",
      firesOnUserDocUpdate: false,
      effect:
        "Only from submitDriverApplicationV2 — not from registration_status patch.",
      classification: "none",
      authDependency: true,
      financeDependency: false,
      tripDependency: false,
      evidence: "driver_registration_v2.js + driver_registration_notifications.js",
    },
    {
      exportName: "adminAdjustDriverWallet",
      firesOnUserDocUpdate: false,
      effect: "No wallet/settlement auto-write on registration_status change.",
      classification: "none",
      authDependency: false,
      financeDependency: true,
      tripDependency: false,
      evidence: "index.js adminAdjustDriverWallet",
    },
    {
      exportName: "ensureMkanListVisibilityOnWrite",
      firesOnUserDocUpdate: false,
      effect: "mkan/{mkanId} only — not user/{uid}.",
      classification: "none",
      authDependency: false,
      financeDependency: false,
      tripDependency: false,
      evidence: "index.js ensureMkanListVisibilityOnWrite",
    },
  ] as const;

/** Create-path rows remain the Phase 5H fixture inventory (cross-check). */
export const PHASE_5H_CREATE_TRIGGER_CROSSCHECK: readonly Phase5HUserDocTriggerRow[] =
  PHASE_5H_USER_DOC_TRIGGER_ANALYSIS;

export type Phase5HApprovedSuspendAuthAssessment = {
  /** Required for GO: none. Proven: Auth write via CF. */
  authImpact: "none" | "present";
  authWritesExpected: number;
  AUTH_SIDE_EFFECT_PRESENT: true;
  uncontrolledAuthTrigger: "syncUserClaimsOnWrite";
  claimsPayloadDependsOnRegistrationStatus: false;
  claimsPayloadDependsOnActevMndob: false;
  setCustomUserClaimsAlwaysCalledOnUpdate: true;
  financeTriggerOnUpdate: false;
  tripTriggerOnUpdate: false;
  highRiskTriggers: readonly string[];
  stopReason: string;
  recommendationIfNoGo: "AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING";
};

/**
 * Offline Auth assessment for approved↔suspended Pilot.
 * Fail-closed: any Auth write ⇒ AUTH_SIDE_EFFECT_PRESENT.
 */
export function assessAuthImpactForApprovedSuspendPilot(): Phase5HApprovedSuspendAuthAssessment {
  const highRisk = PHASE_5H_APPROVED_UPDATE_TRIGGER_ANALYSIS.filter(
    (r) => r.classification === "high-risk" && r.firesOnUserDocUpdate,
  ).map((r) => r.exportName);

  return {
    authImpact: "present",
    authWritesExpected: 1,
    AUTH_SIDE_EFFECT_PRESENT: true,
    uncontrolledAuthTrigger: "syncUserClaimsOnWrite",
    claimsPayloadDependsOnRegistrationStatus: false,
    claimsPayloadDependsOnActevMndob: false,
    setCustomUserClaimsAlwaysCalledOnUpdate: true,
    financeTriggerOnUpdate: false,
    tripTriggerOnUpdate: false,
    highRiskTriggers: highRisk,
    stopReason:
      "Production syncUserClaimsOnWrite on user/{uid} ALWAYS calls " +
      "admin.auth().setCustomUserClaims after any update where after.exists. " +
      "approved→suspended and suspended→approved registration_status patches " +
      "therefore imply authWritesExpected≥1 (required=0). " +
      "AUTH_SIDE_EFFECT_PRESENT → EXISTING_APPROVED_SYNTHETIC_PILOT=NO_GO. " +
      "Recommend AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING. No silent fallback.",
    recommendationIfNoGo: "AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING",
  };
}
