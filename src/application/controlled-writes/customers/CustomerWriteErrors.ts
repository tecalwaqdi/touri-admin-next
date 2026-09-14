/**
 * Phase 5C — Stable error codes for Customer Controlled Writes.
 * Do not invent aliases at call sites; map pipeline denials to these codes.
 */

export const CUSTOMER_WRITE_ERROR_CODES = [
  "PRODUCTION_WRITE_DISABLED",
  "PERMISSION_DENIED",
  "SCOPE_DENIED",
  "CUSTOMER_NOT_FOUND",
  "NOT_OPERATIONAL_CUSTOMER",
  "INVALID_CUSTOMER_STATE_TRANSITION",
  "PRECONDITION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "CUSTOMER_HAS_ACTIVE_TRIP",
  "REASON_REQUIRED",
  "AUTH_WRITE_DISABLED",
  "VALIDATION_FAILED",
  "INTERNAL_WRITE_FAILURE",
] as const;

export type CustomerWriteErrorCode =
  (typeof CUSTOMER_WRITE_ERROR_CODES)[number];

export class CustomerWriteError extends Error {
  readonly code: CustomerWriteErrorCode;
  readonly productionWriteExecuted = false as const;

  constructor(code: CustomerWriteErrorCode, message: string) {
    super(message);
    this.name = "CustomerWriteError";
    this.code = code;
  }
}

export function isCustomerWriteErrorCode(
  value: string,
): value is CustomerWriteErrorCode {
  return (CUSTOMER_WRITE_ERROR_CODES as readonly string[]).includes(value);
}
