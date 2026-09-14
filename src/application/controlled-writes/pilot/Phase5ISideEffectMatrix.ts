/**
 * Phase 5I — Auth create + user/{uid} create side-effect + communication matrix.
 * Evidence: ara-ban Admin Functions (READ ONLY). No Production invocation.
 */

export type Phase5ISideEffectClass =
  | "bounded_predictable"
  | "uncontrolled"
  | "none";

export type Phase5ISideEffectRow = {
  readonly surface: string;
  readonly onAuthCreate: boolean;
  readonly onUserDocCreate: boolean;
  readonly classification: Phase5ISideEffectClass;
  readonly effect: string;
  readonly evidence: string;
};

/**
 * Closed matrix for operator Auth createUser({disabled:true}) +
 * Firestore user/{authUid} create with Phase 5I typed payload.
 */
export const PHASE_5I_SIDE_EFFECT_MATRIX: readonly Phase5ISideEffectRow[] = [
  {
    surface: "syncUserClaimsOnWrite",
    onAuthCreate: false,
    onUserDocCreate: true,
    classification: "bounded_predictable",
    effect:
      "deriveClaimsFromUserData → setCustomUserClaims(uid, {country_id}). " +
      "Bounded: Auth user exists (same uid); elevated claims absent; " +
      "claims only on the synthetic Auth identity.",
    evidence: "index.js syncUserClaimsOnWrite + panel_claims.js",
  },
  {
    surface: "refreshMyClaims",
    onAuthCreate: false,
    onUserDocCreate: false,
    classification: "none",
    effect: "Callable only — not auto-invoked.",
    evidence: "index.js refreshMyClaims",
  },
  {
    surface: "notifyAdminsDriverApplication / email OTP / Resend",
    onAuthCreate: false,
    onUserDocCreate: false,
    classification: "none",
    effect:
      "Only from submitDriverApplicationV2 / email_verification_otp callables — " +
      "NOT from Admin Auth createUser or bare user doc create.",
    evidence:
      "driver_registration_v2.js + email_verification_otp.js + resend_email_service.js",
  },
  {
    surface: "SMS / phone OTP",
    onAuthCreate: false,
    onUserDocCreate: false,
    classification: "none",
    effect: "No phoneNumber on Auth create; no SMS CF on user create.",
    evidence: "CreateRequest phone optional; no user onCreate SMS export",
  },
  {
    surface: "Push / FCM welcome",
    onAuthCreate: false,
    onUserDocCreate: false,
    classification: "none",
    effect:
      "notifyAdminsOnNewBooking is order onCreate — not user create. " +
      "No fcm_token on fixture payload.",
    evidence: "index.js notifyAdminsOnNewBooking",
  },
  {
    surface: "Wallet / finance auto-create",
    onAuthCreate: false,
    onUserDocCreate: false,
    classification: "none",
    effect: "adminAdjustDriverWallet callable only — no auto wallet on user create.",
    evidence: "index.js adminAdjustDriverWallet",
  },
  {
    surface: "Trip / analytics auto-write",
    onAuthCreate: false,
    onUserDocCreate: false,
    classification: "none",
    effect: "No trip or analytics trigger on user/{uid} create.",
    evidence: "index.js export inventory (user triggers: sync + onUserDeleted)",
  },
  {
    surface: "onUserDeleted",
    onAuthCreate: false,
    onUserDocCreate: false,
    classification: "none",
    effect: "Auth delete path only.",
    evidence: "index.js onUserDeleted",
  },
  {
    surface: "Firebase Auth welcome email",
    onAuthCreate: false,
    onUserDocCreate: false,
    classification: "none",
    effect:
      "No email on Auth create → no email provider / verification mail. " +
      "Admin createUser does not send welcome by default.",
    evidence: "PHASE_5I_AUTH_CREATE_PROPERTIES.email=undefined",
  },
] as const;

export type Phase5ICommunicationAssessment = {
  readonly email: false;
  readonly otp: false;
  readonly sms: false;
  readonly push: false;
  readonly welcome: false;
  readonly uncontrolledCommunication: false;
  readonly verdict: "COMMUNICATION_GO";
};

export function assessCommunicationSideEffects(): Phase5ICommunicationAssessment {
  const uncontrolledComm = PHASE_5I_SIDE_EFFECT_MATRIX.some(
    (r) =>
      r.classification === "uncontrolled" &&
      (r.surface.includes("email") ||
        r.surface.includes("OTP") ||
        r.surface.includes("SMS") ||
        r.surface.includes("Push") ||
        r.surface.includes("welcome")),
  );
  if (uncontrolledComm) {
    throw new Error("COMMUNICATION_NO_GO — uncontrolled communication surface");
  }
  return {
    email: false,
    otp: false,
    sms: false,
    push: false,
    welcome: false,
    uncontrolledCommunication: false,
    verdict: "COMMUNICATION_GO",
  };
}

export function classifySyncClaimsForAuthSafePath(): Phase5ISideEffectClass {
  const row = PHASE_5I_SIDE_EFFECT_MATRIX.find(
    (r) => r.surface === "syncUserClaimsOnWrite",
  );
  return row?.classification ?? "uncontrolled";
}
