/**
 * Phase 5G — Production Auth failure classification.
 * Maps identity-verifier / actor-resolution outcomes to stable operator codes.
 * Never attaches token, Authorization, claims, or credential material.
 */

import type { IdentityVerificationFailureReason } from "@/domain/auth/ProductionIdentityVerifier";
import { safeFirebaseAuthErrorCode } from "@/infrastructure/production/firebase/FirebaseAdminProductionIdentityVerifier";

/** Operator-facing Auth denial codes (Phase 5G+). */
export type ProductionAuthFailureCode =
  | "TOKEN_MISSING"
  | "TOKEN_EXPIRED"
  | "TOKEN_PROJECT_MISMATCH"
  | "TOKEN_VERIFICATION_FAILED"
  | "ACTOR_RESOLUTION_FAILED"
  | "AUTH_TIMEOUT";

const VERIFIER_TO_CODE: Record<
  IdentityVerificationFailureReason,
  ProductionAuthFailureCode
> = {
  missing_token: "TOKEN_MISSING",
  expired_token: "TOKEN_EXPIRED",
  wrong_audience: "TOKEN_PROJECT_MISMATCH",
  wrong_issuer: "TOKEN_PROJECT_MISMATCH",
  invalid_token: "TOKEN_VERIFICATION_FAILED",
  token_verification_failed: "TOKEN_VERIFICATION_FAILED",
  user_lookup_failed: "TOKEN_VERIFICATION_FAILED",
  malformed_claims: "TOKEN_VERIFICATION_FAILED",
  verifier_unavailable: "TOKEN_VERIFICATION_FAILED",
  disabled_user: "ACTOR_RESOLUTION_FAILED",
};

/**
 * Classify a ProductionIdentityVerifier failure reason.
 */
export function classifyIdentityVerificationFailure(
  reason: IdentityVerificationFailureReason | string,
): ProductionAuthFailureCode {
  if (reason in VERIFIER_TO_CODE) {
    return VERIFIER_TO_CODE[reason as IdentityVerificationFailureReason];
  }
  if (reason === "AUTH_TIMEOUT" || reason.endsWith("_TIMEOUT")) {
    return "AUTH_TIMEOUT";
  }
  if (
    reason.startsWith("missing_scope:") ||
    reason.startsWith("unknown_claim_role") ||
    reason.startsWith("malformed_claims")
  ) {
    return "ACTOR_RESOLUTION_FAILED";
  }
  return "ACTOR_RESOLUTION_FAILED";
}

/**
 * Classify a thrown Auth/SDK error without exposing secrets.
 * Used when resolveProductionVerifiedActor throws (factory/ADC/wiring).
 */
export function classifyProductionAuthThrownError(
  err: unknown,
): ProductionAuthFailureCode {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("_TIMEOUT_") || /timeout/i.test(msg)) {
    return "AUTH_TIMEOUT";
  }
  const code = safeFirebaseAuthErrorCode(err);
  if (
    code === "auth/id-token-expired" ||
    (code === "auth/argument-error" && /expir/i.test(msg))
  ) {
    return "TOKEN_EXPIRED";
  }
  if (
    code === "auth/invalid-argument" ||
    code === "auth/argument-error" ||
    code === "auth/id-token-revoked" ||
    code === "app/invalid-credential" ||
    code === "auth/insufficient-permission"
  ) {
    return "TOKEN_VERIFICATION_FAILED";
  }
  if (
    /PROJECT_FINGERPRINT_MISMATCH|wrong_audience|wrong_issuer|EXPECTED_PROJECT_ID/i.test(
      msg,
    )
  ) {
    return "TOKEN_PROJECT_MISMATCH";
  }
  return "TOKEN_VERIFICATION_FAILED";
}

/** Safe Auth blocker line for live reports — never includes token material. */
export function formatProductionAuthBlocker(
  code: ProductionAuthFailureCode,
): string {
  return `Auth failed: ${code}`;
}
