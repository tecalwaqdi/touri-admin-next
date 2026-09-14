/**
 * Phase 5K — Auth read-only verification for provisioned fixture.
 * Expects disabled Auth user, no contact, claims = {country_id} only.
 */

import {
  PHASE_5I_ELEVATED_CLAIM_KEYS,
  PHASE_5I_EXPECTED_CLAIM_KEY_COUNT,
  PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
} from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";

export type Phase5KAuthUserRecord = {
  readonly uid: string;
  readonly disabled: boolean;
  readonly email: string | null;
  readonly phoneNumber: string | null;
  readonly displayName?: string | null;
  readonly photoURL?: string | null;
  readonly customClaims: Record<string, unknown>;
  /** Firebase providerData length; 0 = no sign-in credential. */
  readonly providerDataCount: number;
};

export type Phase5KAuthVerificationResult = {
  readonly authUserFound: boolean;
  readonly authDisabled: boolean;
  readonly emailAbsent: boolean;
  readonly phoneAbsent: boolean;
  readonly credentialAbsent: boolean;
  readonly expectedClaimsMatch: boolean;
  readonly elevatedClaimsFound: boolean;
  readonly claimVerificationReadCount: number;
  readonly claimKeyCount: number;
  readonly denials: readonly string[];
};

function claimsMatchExpected(claims: Record<string, unknown>): boolean {
  const keys = Object.keys(claims);
  if (keys.length !== PHASE_5I_EXPECTED_CLAIM_KEY_COUNT) return false;
  return claims.country_id === PHASE_5I_EXPECTED_CUSTOM_CLAIMS.country_id;
}

function hasElevated(claims: Record<string, unknown>): boolean {
  return PHASE_5I_ELEVATED_CLAIM_KEYS.some((k) => claims[k] === true);
}

export function verifyPhase5KAuthUser(
  user: Phase5KAuthUserRecord | null,
  claimVerificationReadCount: number,
): Phase5KAuthVerificationResult {
  const denials: string[] = [];
  if (!user) {
    return {
      authUserFound: false,
      authDisabled: false,
      emailAbsent: false,
      phoneAbsent: false,
      credentialAbsent: false,
      expectedClaimsMatch: false,
      elevatedClaimsFound: false,
      claimVerificationReadCount,
      claimKeyCount: 0,
      denials: ["AUTH_USER_NOT_FOUND"],
    };
  }

  const authDisabled = user.disabled === true;
  const emailAbsent = user.email == null || user.email === "";
  const phoneAbsent = user.phoneNumber == null || user.phoneNumber === "";
  const credentialAbsent = user.providerDataCount === 0;
  const expectedClaimsMatch = claimsMatchExpected(user.customClaims ?? {});
  const elevatedClaimsFound = hasElevated(user.customClaims ?? {});

  if (!authDisabled) denials.push("AUTH_NOT_DISABLED");
  if (!emailAbsent) denials.push("AUTH_EMAIL_PRESENT");
  if (!phoneAbsent) denials.push("AUTH_PHONE_PRESENT");
  if (!credentialAbsent) denials.push("AUTH_CREDENTIAL_PRESENT");
  if (!expectedClaimsMatch) denials.push("CLAIMS_MISMATCH");
  if (elevatedClaimsFound) denials.push("ELEVATED_CLAIMS_FOUND");
  if (claimVerificationReadCount < 1) {
    denials.push("CLAIM_VERIFICATION_READ_COUNT_LT_1");
  }

  return {
    authUserFound: true,
    authDisabled,
    emailAbsent,
    phoneAbsent,
    credentialAbsent,
    expectedClaimsMatch,
    elevatedClaimsFound,
    claimVerificationReadCount,
    claimKeyCount: Object.keys(user.customClaims ?? {}).length,
    denials,
  };
}
