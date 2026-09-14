/**
 * Phase 4 DESIGN ONLY — plan for FirebaseAdminProductionIdentityVerifier.
 * This file documents the future adapter surface.
 * It MUST NOT import firebase-admin, MUST NOT read service-account JSON,
 * MUST NOT initialize an Admin app against Production.
 */

import type {
  ProductionIdentityVerifier,
  ProductionIdentityVerifierConfig,
  IdentityVerificationResult,
} from "@/domain/auth/ProductionIdentityVerifier";

/**
 * Future Phase 4A responsibilities (NOT implemented here):
 * 1. verify Bearer ID token signature via Admin SDK verifyIdToken
 * 2. check issuer / audience / expiration (+ skew)
 * 3. reject disabled users
 * 4. normalize custom claims → VerifiedIdentityClaims
 * 5. never accept x-user-id / x-role headers
 *
 * Credential boundary: dedicated read-only identity if feasible,
 * separate from Legacy deploy/write service accounts.
 */
export type FirebaseAdminProductionIdentityVerifierPlan = {
  readonly name: "FirebaseAdminProductionIdentityVerifier";
  readonly status: "DESIGN_ONLY_NOT_IMPLEMENTED";
  readonly requires: {
    AUTH_MODE: "verified_token";
    expectedProjectId: string;
    expectedIssuer: string;
    expectedAudience: string;
    /** Secret Manager path — NEVER commit */
    credentialSecretRef: string;
  };
  readonly verificationSteps: readonly [
    "parse_bearer",
    "verify_signature",
    "check_issuer",
    "check_audience",
    "check_expiration",
    "check_disabled",
    "normalize_claims",
  ];
};

export const FIREBASE_ADMIN_IDENTITY_VERIFIER_PLAN: FirebaseAdminProductionIdentityVerifierPlan =
  {
    name: "FirebaseAdminProductionIdentityVerifier",
    status: "DESIGN_ONLY_NOT_IMPLEMENTED",
    requires: {
      AUTH_MODE: "verified_token",
      expectedProjectId: "<EXPECTED_PROJECT_ID>",
      expectedIssuer: "https://securetoken.google.com/<EXPECTED_PROJECT_ID>",
      expectedAudience: "<EXPECTED_PROJECT_ID>",
      credentialSecretRef: "sm://admin-next/production-read-verifier",
    },
    verificationSteps: [
      "parse_bearer",
      "verify_signature",
      "check_issuer",
      "check_audience",
      "check_expiration",
      "check_disabled",
      "normalize_claims",
    ],
  };

/**
 * Placeholder that always denies — proves no accidental Production verify path.
 * Phase 4A may replace with Fake for local, then real Admin SDK behind multi-gate.
 */
export class UnimplementedFirebaseAdminProductionIdentityVerifier
  implements ProductionIdentityVerifier
{
  constructor(_config?: ProductionIdentityVerifierConfig) {
    // Intentionally unused — no Admin init.
  }

  async verify(_token: string): Promise<IdentityVerificationResult> {
    return {
      ok: false,
      reason: "verifier_unavailable",
      message:
        "FirebaseAdminProductionIdentityVerifier is DESIGN ONLY — not implemented in Phase 4",
    };
  }
}
