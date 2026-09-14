/**
 * Phase 5H — Auth dependency + Legacy Cloud Functions trigger analysis.
 * READ-ONLY evidence from ara-ban Admin Functions (`index.js` / `panel_claims.js`).
 * Does NOT create Auth. Does NOT write Production.
 */

/**
 * Dedicated synthetic document id — deterministic, proven test_ prefix.
 * NOT a Firebase Auth UID. Not UID-shaped (Auth UIDs are opaque 28-char strings).
 */
export const PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID =
  "test_adminnext_phase5h_driver_pilot_001" as const;

export const PHASE_5H_EXPECTED_PROJECT_ID =
  "tutorial-multi-language-70gx4j" as const;

/**
 * AUTH_REQUIRED_FOR_FIXTURE — Production `syncUserClaimsOnWrite` treats
 * `user/{uid}` document id as Auth UID and ALWAYS calls
 * `admin.auth().setCustomUserClaims(uid, claims)` after any create/update
 * where `after.exists`. Without a real Auth user that call fails
 * (`auth/user-not-found`). Prefer Firestore-only → STOP; do not create Auth.
 */
export const AUTH_REQUIRED_FOR_FIXTURE = true as const;

/**
 * Fixture creation is NO-GO while Auth is required and Auth create is forbidden.
 * Dry-run / preparation remain allowed with write flags false.
 */
export const FIXTURE_CREATION_NO_GO = true as const;

export type Phase5HTriggerSideEffectClass =
  | "bounded_predictable"
  | "uncontrolled"
  | "none";

export type Phase5HUserDocTriggerRow = {
  exportName: string;
  type: "firestore.onWrite" | "firestore.onCreate" | "callable" | "auth.onDelete";
  pathOrSurface: string;
  firesOnUserDocCreate: boolean;
  effect: string;
  classification: Phase5HTriggerSideEffectClass;
  authDependency: boolean;
  financeDependency: boolean;
  tripDependency: boolean;
  notificationDependency: boolean;
  evidence: string;
};

/**
 * Closed inventory of user/{uid} side effects relevant to fixture CREATE.
 * Source: ara-ban `admin/Admi/firebase/functions/index.js` (+ panel_claims.js).
 */
export const PHASE_5H_USER_DOC_TRIGGER_ANALYSIS: readonly Phase5HUserDocTriggerRow[] =
  [
    {
      exportName: "syncUserClaimsOnWrite",
      type: "firestore.onWrite",
      pathOrSurface: "user/{uid}",
      firesOnUserDocCreate: true,
      effect:
        "deriveClaimsFromUserData → admin.auth().setCustomUserClaims(uid, claims). " +
        "For non-panel driver (no IsAdmin/Isagent/isAdminRule) claims are empty or " +
        "at most { country_id } when Rev_dolh is a DocumentReference with .path.",
      classification: "uncontrolled",
      authDependency: true,
      financeDependency: false,
      tripDependency: false,
      notificationDependency: false,
      evidence:
        "ara-ban admin/Admi/firebase/functions/index.js syncUserClaimsOnWrite + " +
        "panel_claims.js deriveClaimsFromUserData",
    },
    {
      exportName: "refreshMyClaims",
      type: "callable",
      pathOrSurface: "https.onCall",
      firesOnUserDocCreate: false,
      effect: "Caller-auth only; not auto-invoked on Firestore create.",
      classification: "none",
      authDependency: true,
      financeDependency: false,
      tripDependency: false,
      notificationDependency: false,
      evidence: "index.js refreshMyClaims",
    },
    {
      exportName: "notifyAdminsDriverApplication",
      type: "callable",
      pathOrSurface: "driver_registration_notifications (from submitDriverApplicationV2)",
      firesOnUserDocCreate: false,
      effect:
        "Invoked only from submitDriverApplicationV2 callable after Auth submit — " +
        "NOT from user/{uid} onCreate/onWrite.",
      classification: "none",
      authDependency: true,
      financeDependency: false,
      tripDependency: false,
      notificationDependency: true,
      evidence: "driver_registration_v2.js + driver_registration_notifications.js",
    },
    {
      exportName: "adminAdjustDriverWallet",
      type: "callable",
      pathOrSurface: "https.onCall",
      firesOnUserDocCreate: false,
      effect: "No wallet/settlement auto-create on user doc create.",
      classification: "none",
      authDependency: false,
      financeDependency: true,
      tripDependency: false,
      notificationDependency: false,
      evidence: "index.js adminAdjustDriverWallet",
    },
    {
      exportName: "onUserDeleted",
      type: "auth.onDelete",
      pathOrSurface: "auth.user().onDelete",
      firesOnUserDocCreate: false,
      effect: "Auth delete cleanup only — not create path.",
      classification: "none",
      authDependency: true,
      financeDependency: false,
      tripDependency: false,
      notificationDependency: false,
      evidence: "index.js onUserDeleted",
    },
  ] as const;

export type Phase5HAuthFixtureAssessment = {
  AUTH_REQUIRED_FOR_FIXTURE: typeof AUTH_REQUIRED_FOR_FIXTURE;
  FIXTURE_CREATION_NO_GO: typeof FIXTURE_CREATION_NO_GO;
  documentIdIsAuthUidByConvention: true;
  documentIdMustBeUidShaped: false;
  createFakeAuthUser: "forbidden";
  firestoreOnlyPreferred: true;
  stopReason: string;
  uncontrolledTriggers: readonly string[];
  boundedPredictableTriggers: readonly string[];
};

export function assessAuthDependencyForFixture(): Phase5HAuthFixtureAssessment {
  const uncontrolled = PHASE_5H_USER_DOC_TRIGGER_ANALYSIS.filter(
    (r) => r.classification === "uncontrolled" && r.firesOnUserDocCreate,
  ).map((r) => r.exportName);
  const bounded = PHASE_5H_USER_DOC_TRIGGER_ANALYSIS.filter(
    (r) => r.classification === "bounded_predictable" && r.firesOnUserDocCreate,
  ).map((r) => r.exportName);

  return {
    AUTH_REQUIRED_FOR_FIXTURE,
    FIXTURE_CREATION_NO_GO,
    documentIdIsAuthUidByConvention: true,
    documentIdMustBeUidShaped: false,
    createFakeAuthUser: "forbidden",
    firestoreOnlyPreferred: true,
    stopReason:
      "Production syncUserClaimsOnWrite on user/{uid} requires a real Auth user " +
      "for document id = Auth UID. Firestore-only create leaves an uncontrolled " +
      "Auth setCustomUserClaims failure (auth/user-not-found). Auth user creation " +
      "is forbidden in Phase 5H. Therefore AUTH_REQUIRED_FOR_FIXTURE=true and " +
      "FIXTURE_CREATION_NO_GO=true. STOP — do not create Auth; do not create fixture.",
    uncontrolledTriggers: uncontrolled,
    boundedPredictableTriggers: bounded,
  };
}
