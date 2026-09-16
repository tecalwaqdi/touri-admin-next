export const NOTIFICATION_WRITE_ERROR_CODES = [
  "PERMISSION_DENIED",
  "SCOPE_DENIED",
  "NOTIFICATION_NOT_FOUND",
  "VALIDATION_FAILED",
  "ARBITRARY_FCM_TOKEN_FORBIDDEN",
  "DUPLICATE_SEND",
  "IDEMPOTENCY_CONFLICT",
  "PRODUCTION_WRITE_DISABLED",
  "RESOURCE_WRITE_DISABLED",
  "INTERNAL_WRITE_FAILURE",
] as const;

export type NotificationWriteErrorCode =
  (typeof NOTIFICATION_WRITE_ERROR_CODES)[number];

export class NotificationWriteError extends Error {
  readonly code: NotificationWriteErrorCode;
  constructor(code: NotificationWriteErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "NotificationWriteError";
  }
}

export function isNotificationWriteErrorCode(
  v: string,
): v is NotificationWriteErrorCode {
  return (NOTIFICATION_WRITE_ERROR_CODES as readonly string[]).includes(v);
}
