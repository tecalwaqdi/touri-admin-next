export const SUPPORT_WRITE_ERROR_CODES = [
  "PERMISSION_DENIED",
  "SCOPE_DENIED",
  "SUPPORT_NOT_FOUND",
  "VALIDATION_FAILED",
  "PRECONDITION_FAILED",
  "ILLEGAL_STATUS_TRANSITION",
  "IDEMPOTENCY_CONFLICT",
  "PRODUCTION_WRITE_DISABLED",
  "RESOURCE_WRITE_DISABLED",
  "INTERNAL_WRITE_FAILURE",
] as const;

export type SupportWriteErrorCode = (typeof SUPPORT_WRITE_ERROR_CODES)[number];

export class SupportWriteError extends Error {
  readonly code: SupportWriteErrorCode;
  constructor(code: SupportWriteErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "SupportWriteError";
  }
}

export function isSupportWriteErrorCode(v: string): v is SupportWriteErrorCode {
  return (SUPPORT_WRITE_ERROR_CODES as readonly string[]).includes(v);
}
