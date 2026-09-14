/**
 * Phase 5A — Stable error codes for Driver Controlled Writes.
 * Do not invent aliases at call sites; map pipeline denials to these codes.
 */

export const DRIVER_WRITE_ERROR_CODES = [
  "PRODUCTION_WRITE_DISABLED",
  "PERMISSION_DENIED",
  "SCOPE_DENIED",
  "DRIVER_NOT_FOUND",
  "NOT_OPERATIONAL_DRIVER",
  "INVALID_DRIVER_STATE_TRANSITION",
  "PRECONDITION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "DRIVER_HAS_ACTIVE_TRIP",
  "DRIVER_NOT_READY_FOR_APPROVAL",
  "VALIDATION_FAILED",
  "INTERNAL_WRITE_FAILURE",
  /** Phase 5M — Admin SDK IAM denials classified by pipeline stage (no retry). */
  "AUDIT_INTENT_PERMISSION_DENIED",
  "DRIVER_DOMAIN_PERMISSION_DENIED",
  "IDEMPOTENCY_PERMISSION_DENIED",
  "AUDIT_RESULT_PERMISSION_DENIED",
] as const;

export type DriverWriteErrorCode = (typeof DRIVER_WRITE_ERROR_CODES)[number];

export class DriverWriteError extends Error {
  readonly code: DriverWriteErrorCode;
  readonly productionWriteExecuted = false as const;

  constructor(code: DriverWriteErrorCode, message: string) {
    super(message);
    this.name = "DriverWriteError";
    this.code = code;
  }
}

export function isDriverWriteErrorCode(value: string): value is DriverWriteErrorCode {
  return (DRIVER_WRITE_ERROR_CODES as readonly string[]).includes(value);
}
