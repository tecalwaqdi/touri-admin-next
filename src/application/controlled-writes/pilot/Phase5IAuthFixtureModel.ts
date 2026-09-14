/**
 * Phase 5I — Auth fixture model for dedicated synthetic Driver.
 * DESIGN ONLY. No Auth create. No password display/persist/login.
 *
 * Evidence:
 * - firebase-admin CreateRequest: email/password/phoneNumber/uid all optional;
 *   disabled?: boolean is supported (auth-config.d.ts UpdateRequest/CreateRequest).
 * - Legacy createPanelUser requires email+password — that path is NOT used here.
 * - Operator service uses Admin Auth createUser directly (when future-gated).
 */

/** Logical operator registry name — not an Auth uid / email. */
export const PHASE_5I_LOGICAL_FIXTURE_NAME =
  "phase5i_driver_pilot_fixture_v1" as const;

export const PHASE_5I_EXPECTED_PROJECT_ID =
  "tutorial-multi-language-70gx4j" as const;

/**
 * Exact Auth create properties preferred for the synthetic fixture.
 * No real email/phone/OTP. No password preferred.
 */
export type Phase5IAuthCreateProperties = {
  readonly disabled: true;
  /** Omit — Admin SDK CreateRequest.email is optional. */
  readonly email: undefined;
  /** Omit — no phone / SMS surface. */
  readonly phoneNumber: undefined;
  /** Omit — password not preferred; Admin SDK does not require it. */
  readonly password: undefined;
  /** Prefer Auth-generated UID (omit uid). */
  readonly uid: undefined;
  readonly emailVerified: false;
};

export const PHASE_5I_AUTH_CREATE_PROPERTIES: Phase5IAuthCreateProperties = {
  disabled: true,
  email: undefined,
  phoneNumber: undefined,
  password: undefined,
  uid: undefined,
  emailVerified: false,
};

/**
 * Email requirement analysis:
 * - Admin SDK CreateRequest: email optional → emailRequired=false for Auth API.
 * - Legacy createPanelUser (ara-ban index.js): createUser({email, password}) —
 *   email required ONLY on that callable path, which Phase 5I must NOT call.
 * - Reserved non-deliverable email: NOT needed when Admin SDK path is used.
 */
export const PHASE_5I_EMAIL_REQUIREMENT = {
  adminSdkCreateUserRequiresEmail: false,
  legacyCreatePanelUserRequiresEmail: true,
  phase5IUsesCreatePanelUser: false,
  reservedNonDeliverableEmailRequired: false,
  realEmailAllowed: false,
  phoneAllowed: false,
  otpAllowed: false,
  evidence:
    "firebase-admin CreateRequest.email?: string (optional); " +
    "ara-ban createPanelUser → admin.auth().createUser({email, password}) " +
    "(email required on that path only — Phase 5I bypasses createPanelUser).",
} as const;

export const PHASE_5I_PASSWORD_POLICY = {
  passwordPreferred: false,
  passwordRequiredByAdminSdk: false,
  ifEverGenerated: "random_ephemeral_never_display_persist_or_login" as const,
  displayAllowed: false,
  persistAllowed: false,
  loginAllowed: false,
} as const;

export type Phase5IDisabledAuthCompatibility = {
  readonly disabledTrueCompatibleWithSetCustomUserClaims: true;
  readonly disabledBlocksClientSignIn: true;
  readonly syncUserClaimsOnWriteDoesNotCheckDisabled: true;
  readonly membershipClassificationIgnoresAuthDisabled: true;
  readonly futureNeedsChangesPilotIsFirestoreDomainOnly: true;
  readonly notes: string;
};

/**
 * Disabled Auth users still accept Admin setCustomUserClaims.
 * syncClaimsForUid never reads Auth disabled flag before claims write.
 * Future needs_changes Pilot mutates Firestore registration_status only.
 */
export function assessDisabledAuthCompatibility(): Phase5IDisabledAuthCompatibility {
  return {
    disabledTrueCompatibleWithSetCustomUserClaims: true,
    disabledBlocksClientSignIn: true,
    syncUserClaimsOnWriteDoesNotCheckDisabled: true,
    membershipClassificationIgnoresAuthDisabled: true,
    futureNeedsChangesPilotIsFirestoreDomainOnly: true,
    notes:
      "Auth disabled=true is preferred: no client login, claims sync still works, " +
      "membership/Pilot eligibility remain Firestore-field driven.",
  };
}

export type Phase5IUidStrategy = {
  readonly preferAuthGeneratedUid: true;
  readonly authUidEqualsFirestoreDocId: true;
  readonly forbidOrphanNonAuthDocIds: true;
  readonly forbidReuseOfRealAdminDriverCustomerAgentUids: true;
  readonly syntheticViaIdPrefixAlone: false;
  readonly syntheticViaFirestoreMarkers: true;
  readonly markers: readonly ["is_test", "functional_test", "qa_fixture"];
  readonly documentIdKnownAtDesignTime: false;
  readonly documentIdResolvedAtAuthCreate: true;
};

export const PHASE_5I_UID_STRATEGY: Phase5IUidStrategy = {
  preferAuthGeneratedUid: true,
  authUidEqualsFirestoreDocId: true,
  forbidOrphanNonAuthDocIds: true,
  forbidReuseOfRealAdminDriverCustomerAgentUids: true,
  syntheticViaIdPrefixAlone: false,
  syntheticViaFirestoreMarkers: true,
  markers: ["is_test", "functional_test", "qa_fixture"],
  documentIdKnownAtDesignTime: false,
  documentIdResolvedAtAuthCreate: true,
};
