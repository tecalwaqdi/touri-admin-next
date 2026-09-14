/**
 * Phase 5J — bounded claim poll / verify after syncUserClaimsOnWrite.
 * Expected: { country_id: "countries/saudi_arabia" } only.
 * Elevated / unexpected → UNEXPECTED_FIXTURE_CLAIMS (not pilot_ready).
 * Timeout → CLAIM_SYNC_TIMEOUT (not pilot_ready).
 */

import {
  PHASE_5I_ELEVATED_CLAIM_KEYS,
  PHASE_5I_EXPECTED_CLAIM_KEY_COUNT,
  PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
} from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";
import type { Phase5JAuthPort } from "@/application/controlled-writes/pilot/Phase5JProvisioningPorts";

export const PHASE_5J_CLAIM_POLL_DEFAULTS = {
  maxAttempts: 8,
  intervalMs: 250,
  timeoutMs: 4000,
} as const;

export type Phase5JClaimsVerifyResult =
  | {
      ok: true;
      claims: typeof PHASE_5I_EXPECTED_CUSTOM_CLAIMS;
      claimKeyCount: typeof PHASE_5I_EXPECTED_CLAIM_KEY_COUNT;
      attempts: number;
      claimsSetObserved: true;
    }
  | {
      ok: false;
      code: "UNEXPECTED_FIXTURE_CLAIMS" | "CLAIM_SYNC_TIMEOUT";
      message: string;
      claims: Record<string, unknown>;
      attempts: number;
      claimsSetObserved: boolean;
    };

function claimsMatchExpected(claims: Record<string, unknown>): boolean {
  const keys = Object.keys(claims);
  if (keys.length !== PHASE_5I_EXPECTED_CLAIM_KEY_COUNT) return false;
  if (claims.country_id !== PHASE_5I_EXPECTED_CUSTOM_CLAIMS.country_id) {
    return false;
  }
  for (const k of PHASE_5I_ELEVATED_CLAIM_KEYS) {
    if (claims[k] === true) return false;
  }
  return true;
}

function hasElevatedOrUnexpected(claims: Record<string, unknown>): boolean {
  for (const k of PHASE_5I_ELEVATED_CLAIM_KEYS) {
    if (claims[k] === true) return true;
  }
  const keys = Object.keys(claims);
  if (keys.length === 0) return false; // still pending
  if (keys.length !== PHASE_5I_EXPECTED_CLAIM_KEY_COUNT) return true;
  if (claims.country_id !== PHASE_5I_EXPECTED_CUSTOM_CLAIMS.country_id) {
    return true;
  }
  return false;
}

export async function verifyPhase5JClaimsBounded(input: {
  auth: Phase5JAuthPort;
  uid: string;
  maxAttempts?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<Phase5JClaimsVerifyResult> {
  const maxAttempts =
    input.maxAttempts ?? PHASE_5J_CLAIM_POLL_DEFAULTS.maxAttempts;
  const intervalMs =
    input.intervalMs ?? PHASE_5J_CLAIM_POLL_DEFAULTS.intervalMs;
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastClaims: Record<string, unknown> = {};
  let attempts = 0;
  let sawNonEmpty = false;

  for (let i = 0; i < maxAttempts; i++) {
    attempts = i + 1;
    const got = await input.auth.getUser(input.uid);
    if (!got.ok) {
      if (i < maxAttempts - 1) await sleep(intervalMs);
      continue;
    }
    lastClaims = got.customClaims ?? {};
    if (Object.keys(lastClaims).length > 0) sawNonEmpty = true;

    if (hasElevatedOrUnexpected(lastClaims) && Object.keys(lastClaims).length > 0) {
      // Distinguishing empty (pending) vs unexpected non-empty.
      if (!claimsMatchExpected(lastClaims)) {
        // If only empty-ish pending, continue; if elevated keys present → fail fast.
        const elevated = PHASE_5I_ELEVATED_CLAIM_KEYS.some(
          (k) => lastClaims[k] === true,
        );
        const wrongCountry =
          lastClaims.country_id != null &&
          lastClaims.country_id !== PHASE_5I_EXPECTED_CUSTOM_CLAIMS.country_id;
        const extraKeys =
          Object.keys(lastClaims).length > PHASE_5I_EXPECTED_CLAIM_KEY_COUNT;
        if (elevated || wrongCountry || extraKeys) {
          return {
            ok: false,
            code: "UNEXPECTED_FIXTURE_CLAIMS",
            message: "Claims do not match {country_id} only",
            claims: lastClaims,
            attempts,
            claimsSetObserved: true,
          };
        }
      }
    }

    if (claimsMatchExpected(lastClaims)) {
      return {
        ok: true,
        claims: PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
        claimKeyCount: PHASE_5I_EXPECTED_CLAIM_KEY_COUNT,
        attempts,
        claimsSetObserved: true,
      };
    }

    if (i < maxAttempts - 1) await sleep(intervalMs);
  }

  if (sawNonEmpty && !claimsMatchExpected(lastClaims)) {
    return {
      ok: false,
      code: "UNEXPECTED_FIXTURE_CLAIMS",
      message: "Claims present but unexpected after poll",
      claims: lastClaims,
      attempts,
      claimsSetObserved: true,
    };
  }

  return {
    ok: false,
    code: "CLAIM_SYNC_TIMEOUT",
    message: "Bounded claim poll timed out before expected claims",
    claims: lastClaims,
    attempts,
    claimsSetObserved: sawNonEmpty,
  };
}
