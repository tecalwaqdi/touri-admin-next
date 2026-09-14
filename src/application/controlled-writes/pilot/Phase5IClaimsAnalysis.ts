/**
 * Phase 5I — syncUserClaimsOnWrite exact effect analysis (READ-ONLY evidence).
 * Source: ara-ban admin/Admi/firebase/functions/{index.js,panel_claims.js}.
 * Does NOT call Auth. Does NOT modify Production trigger.
 */

import {
  PHASE_5I_FIXTURE_COUNTRY_PATH,
  type Phase5ISyntheticDriverFirestoreDoc,
} from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";

/** Claim keys that panel_claims.js may emit (closed inventory). */
export const PHASE_5I_PANEL_CLAIM_KEYS = [
  "super_admin",
  "finance",
  "support",
  "country_admin",
  "agent",
  "partner",
  "transport_manager",
  "country_id",
  "partner_mkan_id",
  "transport_company_id",
] as const;

export type Phase5IPanelClaimKey = (typeof PHASE_5I_PANEL_CLAIM_KEYS)[number];

/**
 * Elevated privilege keys mandated false / absent for AUTH-SAFE fixture.
 * Note: panel_claims never emits literal key "admin" — still mandate absent.
 */
export const PHASE_5I_ELEVATED_CLAIM_KEYS = [
  "super_admin",
  "admin",
  "agent",
  "finance",
  "country_admin",
  "support",
  "partner",
  "transport_manager",
] as const;

/**
 * Offline mirror of panel_claims.deriveClaimsFromUserData for fixture payloads.
 * Faithful to ara-ban panel_claims.js (no new claim semantics).
 */
export function deriveExpectedCustomClaimsFromUserData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const claims: Record<string, unknown> = {};
  const ruleRaw = data.isAdminRule ?? data.IsAdminRule ?? 0;
  const ruleNum =
    typeof ruleRaw === "string"
      ? parseInt(ruleRaw, 10) || 0
      : typeof ruleRaw === "number"
        ? ruleRaw
        : Number(ruleRaw) || 0;

  if (data.isAdmin === true || data.IsAdmin === true || ruleNum === 1) {
    claims.super_admin = true;
    claims.finance = true;
    claims.support = true;
  }
  if (ruleNum === 2) {
    claims.country_admin = true;
    claims.support = true;
  }
  if (data.isagent === true || data.Isagent === true) {
    claims.agent = true;
    claims.support = true;
  }
  if (ruleNum === 3 || data.is_partner === true || data.isPartner === true) {
    claims.partner = true;
  }
  if (ruleNum === 4) {
    claims.transport_manager = true;
  }
  if (ruleNum === 5) {
    claims.finance = true;
  }

  const countryRef = (data.Rev_dloh_agent ?? data.Rev_dolh) as
    | { path?: unknown }
    | undefined;
  if (countryRef && typeof countryRef.path === "string" && countryRef.path) {
    claims.country_id = countryRef.path;
  }
  const partnerMkan = data.partner_mkan as { path?: unknown } | undefined;
  if (partnerMkan && typeof partnerMkan.path === "string" && partnerMkan.path) {
    claims.partner_mkan_id = partnerMkan.path;
  }
  const transportCompany = data.transport_company as
    | { path?: unknown }
    | undefined;
  if (
    transportCompany &&
    typeof transportCompany.path === "string" &&
    transportCompany.path
  ) {
    claims.transport_company_id = transportCompany.path;
  }

  return claims;
}

/**
 * Exact expected claims for Phase 5I typed Driver fixture.
 * Pure driver + Rev_dolh.path → only country_id (scope marker, not elevated role).
 * No synthetic_fixture claim (prefer Firestore markers; avoid authz surface).
 */
export const PHASE_5I_EXPECTED_CUSTOM_CLAIMS = {
  country_id: PHASE_5I_FIXTURE_COUNTRY_PATH,
} as const;

export const PHASE_5I_EXPECTED_CLAIM_KEY_COUNT = 1 as const;

export const PHASE_5I_SYNTHETIC_FIXTURE_CLAIM_POLICY = {
  preferFirestoreMarkers: true,
  addSyntheticFixtureClaim: false,
  reason:
    "Firestore is_test/functional_test/qa_fixture are authoritative; " +
    "synthetic_fixture Auth claim deferred — avoid new authz semantics.",
} as const;

export type Phase5IElevatedPrivilegeAssessment =
  | {
      elevatedPrivilege: false;
      verdict: "AUTH_SAFE_FIXTURE_GO";
      expectedCustomClaims: typeof PHASE_5I_EXPECTED_CUSTOM_CLAIMS;
      claimKeyCount: typeof PHASE_5I_EXPECTED_CLAIM_KEY_COUNT;
      elevatedKeysPresent: readonly string[];
    }
  | {
      elevatedPrivilege: true;
      verdict: "AUTH_SAFE_FIXTURE_NO_GO";
      expectedCustomClaims: Record<string, unknown>;
      claimKeyCount: number;
      elevatedKeysPresent: readonly string[];
    };

export function assessElevatedPrivilegeForClaims(
  claims: Record<string, unknown>,
): Phase5IElevatedPrivilegeAssessment {
  const elevatedKeysPresent = PHASE_5I_ELEVATED_CLAIM_KEYS.filter(
    (k) => claims[k] === true,
  );
  if (elevatedKeysPresent.length > 0) {
    return {
      elevatedPrivilege: true,
      verdict: "AUTH_SAFE_FIXTURE_NO_GO",
      expectedCustomClaims: claims,
      claimKeyCount: Object.keys(claims).length,
      elevatedKeysPresent,
    };
  }
  return {
    elevatedPrivilege: false,
    verdict: "AUTH_SAFE_FIXTURE_GO",
    expectedCustomClaims: PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
    claimKeyCount: PHASE_5I_EXPECTED_CLAIM_KEY_COUNT,
    elevatedKeysPresent: [],
  };
}

export function assessClaimsForFixtureDoc(
  data: Phase5ISyntheticDriverFirestoreDoc,
): Phase5IElevatedPrivilegeAssessment {
  const claims = deriveExpectedCustomClaimsFromUserData(
    data as unknown as Record<string, unknown>,
  );
  return assessElevatedPrivilegeForClaims(claims);
}

/**
 * syncUserClaimsOnWrite exact effect (index.js):
 * - fires on user/{uid} onWrite when after.exists
 * - syncClaimsForUid → deriveClaimsFromUserData → setCustomUserClaims(uid, claims)
 * - does NOT wipe claims when profile missing
 * - refuses empty claims only for panel ruleNum 1..5
 * - Pure driver (no admin rule) may sync empty OR {country_id} — both allowed
 */
export const PHASE_5I_SYNC_USER_CLAIMS_EFFECT = {
  exportName: "syncUserClaimsOnWrite",
  path: "user/{uid}",
  trigger: "firestore.onWrite",
  firesOnCreate: true,
  firesOnUpdate: true,
  alwaysCallsSetCustomUserClaimsWhenAfterExists: true,
  modifyProductionTrigger: "forbidden" as const,
  bypassTrigger: "forbidden" as const,
  expectedForPhase5IFixture: PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
  claimKeyCount: PHASE_5I_EXPECTED_CLAIM_KEY_COUNT,
  elevatedPrivilegeVerdict: "AUTH_SAFE_FIXTURE_GO" as const,
  evidence:
    "ara-ban admin/Admi/firebase/functions/index.js syncUserClaimsOnWrite + " +
    "panel_claims.js deriveClaimsFromUserData",
} as const;
