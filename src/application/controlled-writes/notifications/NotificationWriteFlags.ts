import type { NotificationWriteFlagGate } from "@/application/controlled-writes/notifications/NotificationWriteTypes";
import { NotificationWriteError } from "@/application/controlled-writes/notifications/NotificationWriteErrors";

export const NOTIFICATION_WRITE_PRODUCTION_HARD_FALSE = false as const;

export const DEFAULT_NOTIFICATION_WRITE_FLAGS_FALSE: NotificationWriteFlagGate =
  {
    GLOBAL_PRODUCTION_WRITE_ENABLED: false,
    PRODUCTION_WRITE_ENABLED: false,
    NOTIFICATION_WRITE_ENABLED: false,
  };

export function snapshotNotificationWriteFlags(env: {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  NOTIFICATION_WRITE_ENABLED: boolean;
}): NotificationWriteFlagGate {
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    NOTIFICATION_WRITE_ENABLED: env.NOTIFICATION_WRITE_ENABLED,
  };
}

export function assertNotificationProductionWriteEnabled(
  flags: NotificationWriteFlagGate,
): void {
  if (
    !flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    !flags.PRODUCTION_WRITE_ENABLED ||
    !flags.NOTIFICATION_WRITE_ENABLED
  ) {
    throw new NotificationWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED, PRODUCTION_WRITE_ENABLED, and NOTIFICATION_WRITE_ENABLED required",
    );
  }
  if (NOTIFICATION_WRITE_PRODUCTION_HARD_FALSE === (false as boolean)) {
    throw new NotificationWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "Notification write Production path hard-disabled until operator arming",
    );
  }
}
