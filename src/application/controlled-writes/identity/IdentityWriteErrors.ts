export const IDENTITY_WRITE_ERROR_CODES = [
  "PERMISSION_DENIED",
  "SCOPE_DENIED",
  "SELF_ESCALATION_DENIED",
  "ESCALATION_DENIED",
  "LAST_SUPER_ADMIN_PROTECTED",
  "INVALID_ROLE",
  "VALIDATION_FAILED",
  "PRECONDITION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "USER_NOT_FOUND",
  "NOT_PANEL_PERSONA",
  "PRODUCTION_WRITE_DISABLED",
  "RESOURCE_WRITE_DISABLED",
  "IDENTITY_ADMIN_WIF_REQUIRED",
  "INTERNAL_WRITE_FAILURE",
] as const;

export type IdentityWriteErrorCode = (typeof IDENTITY_WRITE_ERROR_CODES)[number];

export function isIdentityWriteErrorCode(
  code: string,
): code is IdentityWriteErrorCode {
  return (IDENTITY_WRITE_ERROR_CODES as readonly string[]).includes(code);
}

export class IdentityWriteError extends Error {
  constructor(
    readonly code: IdentityWriteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IdentityWriteError";
  }
}
