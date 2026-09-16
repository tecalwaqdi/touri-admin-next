/**
 * Notification controlled writes.
 * Legacy Admin UI: mark-read / mark-all-read on `admin_panel_notifications`.
 * Compose: create panel inbox rows (CF-style writePersistentAdminNotification).
 * Never accept client-supplied FCM tokens. Push delivery via Fake/gated adapter only.
 */

import type { AccessScope, Permission, Role } from "@/types/roles";

export type NotificationWriteAction =
  | "mark_read"
  | "mark_all_read"
  | "compose_send";

export type NotificationAudienceKind =
  | "admin_panel"
  | "country_admins"
  | "role"
  | "user_ids";

export type NotificationWriteActor = {
  uid: string;
  role: Role;
  permissions: Permission[];
  scope: AccessScope;
};

export type NotificationWriteCommand = {
  actor: NotificationWriteActor;
  action: NotificationWriteAction;
  idempotencyKey: string;
  correlationId: string;
  notificationId?: string;
  /** mark_all_read: optional category filter */
  categoryFilter?: string;
  compose?: {
    title: string;
    body: string;
    type?: string;
    audience: {
      kind: NotificationAudienceKind;
      countryId?: string;
      role?: Role;
      userIds?: string[];
    };
    deepLink?: {
      driverId?: string;
      bookingId?: string;
      supportId?: string;
    };
  };
};

export type NotificationWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  NOTIFICATION_WRITE_ENABLED: boolean;
};

export type NotificationWriteCanonicalResponse = {
  ok: boolean;
  status: "applied" | "denied" | "failed" | "idempotent_replay";
  code: string;
  message: string;
  action: NotificationWriteAction;
  productionWriteExecuted: boolean;
  /** Always false in this phase — Fake adapter only. */
  realPushSent: boolean;
  notificationIds?: string[];
  recipientCount?: number;
  auditIntentId?: string;
  auditResultId?: string;
};
