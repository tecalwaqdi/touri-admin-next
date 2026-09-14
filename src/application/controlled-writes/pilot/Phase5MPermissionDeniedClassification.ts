/**
 * Phase 5M — stage-scoped Firestore Admin SDK PERMISSION_DENIED classification.
 * Safe messages only (gRPC code + stage). No secrets / PII / raw stacks.
 * Admin SDK → IAM (not Firestore Security Rules).
 */

import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";

export const PHASE_5M_STAGE_PERMISSION_DENIED_CODES = [
  "AUDIT_INTENT_PERMISSION_DENIED",
  "DRIVER_DOMAIN_PERMISSION_DENIED",
  "IDEMPOTENCY_PERMISSION_DENIED",
  "AUDIT_RESULT_PERMISSION_DENIED",
] as const;

export type Phase5MStagePermissionDeniedCode =
  (typeof PHASE_5M_STAGE_PERMISSION_DENIED_CODES)[number];

export type Phase5MWritePermissionStage =
  | "AUDIT_INTENT"
  | "DRIVER_DOMAIN"
  | "IDEMPOTENCY"
  | "AUDIT_RESULT";

const STAGE_TO_CODE: Record<
  Phase5MWritePermissionStage,
  Phase5MStagePermissionDeniedCode
> = {
  AUDIT_INTENT: "AUDIT_INTENT_PERMISSION_DENIED",
  DRIVER_DOMAIN: "DRIVER_DOMAIN_PERMISSION_DENIED",
  IDEMPOTENCY: "IDEMPOTENCY_PERMISSION_DENIED",
  AUDIT_RESULT: "AUDIT_RESULT_PERMISSION_DENIED",
};

/** Safe gRPC / Admin SDK permission-denied detection (no secret material). */
export function isFirestoreAdminPermissionDenied(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    if (typeof err === "string") {
      return /PERMISSION_DENIED|permission-denied|\b7\b/.test(err);
    }
    return false;
  }
  const e = err as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
    details?: unknown;
  };
  if (e.code === 7 || e.code === "7") return true;
  if (e.code === "permission-denied") return true;
  if (e.status === "PERMISSION_DENIED" || e.status === 7) return true;
  const msg = typeof e.message === "string" ? e.message : "";
  if (/PERMISSION_DENIED|permission-denied/.test(msg)) return true;
  if (typeof e.details === "string" && /PERMISSION_DENIED/.test(e.details)) {
    return true;
  }
  return false;
}

/** Preserve numeric gRPC code when present; never embed PII. */
export function safeGrpcPermissionDeniedLabel(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (code === 7 || code === "7") return "gRPC 7 PERMISSION_DENIED";
    if (code === "permission-denied") return "permission-denied";
  }
  return "PERMISSION_DENIED";
}

export function classifyPhase5MStagePermissionDenied(
  stage: Phase5MWritePermissionStage,
  err: unknown,
): DriverWriteError | null {
  if (!isFirestoreAdminPermissionDenied(err)) return null;
  const code = STAGE_TO_CODE[stage];
  const label = safeGrpcPermissionDeniedLabel(err);
  return new DriverWriteError(
    code,
    `${code}: ${label} (Firebase Admin SDK → IAM; not Security Rules)`,
  );
}

/**
 * Wrap a write/read that must map Admin SDK IAM denials to a stage code.
 * Re-throws existing DriverWriteError unchanged. Never retries.
 */
export async function withPhase5MStagePermissionDenied<T>(
  stage: Phase5MWritePermissionStage,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DriverWriteError) throw err;
    const classified = classifyPhase5MStagePermissionDenied(stage, err);
    if (classified) throw classified;
    throw err;
  }
}
