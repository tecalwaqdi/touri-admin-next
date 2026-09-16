/**
 * Notification controlled-write service.
 * Server resolves audience → never trusts client FCM tokens.
 */

import type {
  NotificationWriteCanonicalResponse,
  NotificationWriteCommand,
  NotificationWriteFlagGate,
} from "@/application/controlled-writes/notifications/NotificationWriteTypes";
import {
  NotificationWriteError,
  isNotificationWriteErrorCode,
  type NotificationWriteErrorCode,
} from "@/application/controlled-writes/notifications/NotificationWriteErrors";
import {
  assertNotificationProductionWriteEnabled,
  snapshotNotificationWriteFlags,
} from "@/application/controlled-writes/notifications/NotificationWriteFlags";
import type {
  PushDeliveryAdapter,
  ResolvedNotificationRecipient,
} from "@/application/controlled-writes/notifications/PushDeliveryAdapter";
import { hasPermission, isWithinScope } from "@/permissions/rbac";
import { createIdempotencyKey } from "@/lib/ids";

export type NotificationWriteRepository = {
  markRead(notificationId: string): Promise<boolean>;
  markAllRead(input: {
    actorUid: string;
    categoryFilter?: string;
  }): Promise<string[]>;
  createPanelNotification(input: {
    id: string;
    title: string;
    body: string;
    type: string;
    countryId: string | null;
    deepLink?: NotificationWriteCommand["compose"];
  }): Promise<string>;
};

export type AudienceResolver = {
  resolve(
    command: NotificationWriteCommand,
  ): Promise<ResolvedNotificationRecipient[]>;
};

export type NotificationWriteIdempotencyStore = {
  get(key: string): Promise<NotificationWriteCanonicalResponse | null>;
  put(key: string, response: NotificationWriteCanonicalResponse): Promise<void>;
};

export type NotificationWriteAuditPort = {
  recordIntent(input: {
    command: NotificationWriteCommand;
  }): Promise<{ intentId: string }>;
  recordResult(input: {
    intentId: string;
    ok: boolean;
    code: string;
    command: NotificationWriteCommand;
  }): Promise<{ resultId: string }>;
};

export type NotificationControlledWriteServiceDeps = {
  flags: NotificationWriteFlagGate;
  repository: NotificationWriteRepository;
  audienceResolver: AudienceResolver;
  pushAdapter: PushDeliveryAdapter;
  idempotency: NotificationWriteIdempotencyStore;
  audit: NotificationWriteAuditPort;
  allowOfflineExecution?: boolean;
  /** In-memory duplicate send protection (title+audience+window). */
  recentSendKeys?: Set<string>;
};

export class FakeNotificationWriteRepository
  implements NotificationWriteRepository
{
  readonly read = new Set<string>();
  readonly created: Array<Record<string, unknown>> = [];

  async markRead(notificationId: string): Promise<boolean> {
    this.read.add(notificationId);
    return true;
  }

  async markAllRead(): Promise<string[]> {
    const ids = ["n1", "n2"];
    ids.forEach((id) => this.read.add(id));
    return ids;
  }

  async createPanelNotification(input: {
    id: string;
    title: string;
    body: string;
    type: string;
    countryId: string | null;
  }): Promise<string> {
    this.created.push(input);
    return input.id;
  }
}

export class FakeAudienceResolver implements AudienceResolver {
  async resolve(
    command: NotificationWriteCommand,
  ): Promise<ResolvedNotificationRecipient[]> {
    const audience = command.compose?.audience;
    if (!audience) return [];
    if (audience.kind === "user_ids") {
      return (audience.userIds ?? []).map((userId) => ({
        userId,
        fcmTokens: [], // server would load; Fake has none
      }));
    }
    if (audience.kind === "country_admins" && audience.countryId) {
      return [{ userId: `admin-${audience.countryId}`, fcmTokens: [] }];
    }
    if (audience.kind === "role" && audience.role) {
      return [{ userId: `role-${audience.role}`, fcmTokens: [] }];
    }
    return [{ userId: "panel", fcmTokens: [] }];
  }
}

function deny(
  command: NotificationWriteCommand,
  code: NotificationWriteErrorCode,
  message: string,
): NotificationWriteCanonicalResponse {
  return {
    ok: false,
    status: code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
    code,
    message,
    action: command.action,
    productionWriteExecuted: false,
    realPushSent: false,
  };
}

function toErrorCode(err: unknown): {
  code: NotificationWriteErrorCode;
  message: string;
} {
  if (err instanceof NotificationWriteError) {
    return { code: err.code, message: err.message };
  }
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    isNotificationWriteErrorCode((err as { code: string }).code)
  ) {
    return {
      code: (err as { code: NotificationWriteErrorCode }).code,
      message: err instanceof Error ? err.message : String((err as { code: string }).code),
    };
  }
  return {
    code: "INTERNAL_WRITE_FAILURE",
    message: err instanceof Error ? err.message : String(err),
  };
}

function assertRbac(command: NotificationWriteCommand): void {
  if (
    !hasPermission(command.actor.permissions, "drivers:approve") &&
    !hasPermission(command.actor.permissions, "users:manage") &&
    !hasPermission(command.actor.permissions, "customers:manage")
  ) {
    throw new NotificationWriteError(
      "PERMISSION_DENIED",
      "Notification write requires drivers:approve, customers:manage, or users:manage",
    );
  }
}

export async function executeNotificationControlledWrite(
  command: NotificationWriteCommand,
  deps: NotificationControlledWriteServiceDeps,
): Promise<NotificationWriteCanonicalResponse> {
  try {
    if (!command.actor?.uid?.trim()) {
      return deny(command, "PERMISSION_DENIED", "Verified actor required");
    }
    if (!command.idempotencyKey?.trim()) {
      return deny(command, "VALIDATION_FAILED", "idempotencyKey required");
    }

    const flags = snapshotNotificationWriteFlags(deps.flags);
    if (!deps.allowOfflineExecution) {
      try {
        assertNotificationProductionWriteEnabled(flags);
      } catch (err) {
        const mapped = toErrorCode(err);
        return deny(command, mapped.code, mapped.message);
      }
    }

    assertRbac(command);

    const replay = await deps.idempotency.get(command.idempotencyKey);
    if (replay) {
      return {
        ...replay,
        status: "idempotent_replay",
        productionWriteExecuted: false,
        realPushSent: false,
      };
    }

    const { intentId } = await deps.audit.recordIntent({ command });
    let notificationIds: string[] = [];
    let recipientCount = 0;

    if (command.action === "mark_read") {
      if (!command.notificationId?.trim()) {
        throw new NotificationWriteError(
          "VALIDATION_FAILED",
          "notificationId required",
        );
      }
      const ok = await deps.repository.markRead(command.notificationId);
      if (!ok) {
        throw new NotificationWriteError(
          "NOTIFICATION_NOT_FOUND",
          command.notificationId,
        );
      }
      notificationIds = [command.notificationId];
    } else if (command.action === "mark_all_read") {
      notificationIds = await deps.repository.markAllRead({
        actorUid: command.actor.uid,
        categoryFilter: command.categoryFilter,
      });
    } else if (command.action === "compose_send") {
      const compose = command.compose;
      if (!compose?.title?.trim() || !compose.body?.trim()) {
        throw new NotificationWriteError(
          "VALIDATION_FAILED",
          "compose title and body required",
        );
      }
      if (!compose.audience?.kind) {
        throw new NotificationWriteError(
          "VALIDATION_FAILED",
          "compose.audience.kind required",
        );
      }
      if (
        compose.audience.kind === "country_admins" &&
        compose.audience.countryId &&
        command.actor.scope.type !== "global" &&
        !isWithinScope(command.actor.scope, {
          countryId: compose.audience.countryId,
        })
      ) {
        throw new NotificationWriteError(
          "SCOPE_DENIED",
          "Audience country out of scope",
        );
      }

      const dupKey = [
        compose.title.trim().toLowerCase(),
        compose.audience.kind,
        compose.audience.countryId ?? "",
        compose.audience.role ?? "",
        (compose.audience.userIds ?? []).join(","),
      ].join("|");
      const recent = deps.recentSendKeys ?? new Set<string>();
      if (recent.has(dupKey)) {
        throw new NotificationWriteError(
          "DUPLICATE_SEND",
          "Duplicate compose_send within protection window",
        );
      }
      recent.add(dupKey);

      const recipients = await deps.audienceResolver.resolve(command);
      recipientCount = recipients.length;
      const id = createIdempotencyKey(`panel-notif-${command.idempotencyKey}`).slice(
        0,
        40,
      );
      const createdId = await deps.repository.createPanelNotification({
        id,
        title: compose.title.trim(),
        body: compose.body.trim(),
        type: compose.type?.trim() || "admin_broadcast",
        countryId: compose.audience.countryId ?? null,
        deepLink: compose,
      });
      notificationIds = [createdId];

      await deps.pushAdapter.deliver({
        title: compose.title.trim(),
        body: compose.body.trim(),
        recipients,
        correlationId: command.correlationId,
        idempotencyKey: command.idempotencyKey,
      });
    } else {
      throw new NotificationWriteError("VALIDATION_FAILED", "Unknown action");
    }

    const { resultId } = await deps.audit.recordResult({
      intentId,
      ok: true,
      code: "APPLIED",
      command,
    });

    const response: NotificationWriteCanonicalResponse = {
      ok: true,
      status: "applied",
      code: "APPLIED",
      message: "Notification write applied (Fake/gated — no Production push)",
      action: command.action,
      productionWriteExecuted: false,
      realPushSent: false,
      notificationIds,
      recipientCount,
      auditIntentId: intentId,
      auditResultId: resultId,
    };
    await deps.idempotency.put(command.idempotencyKey, response);
    return response;
  } catch (err) {
    const mapped = toErrorCode(err);
    return deny(command, mapped.code, mapped.message);
  }
}
