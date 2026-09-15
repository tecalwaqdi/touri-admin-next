import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  getProductionOperationalReadRuntime,
  isProductionOperationalReadArmed,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import { FirebaseProductionNotificationReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionNotificationReadRepository";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import type { AdminNotificationListItem } from "@/domain/notifications/AdminNotificationMapping";

export class NotificationSourceUnavailableError extends Error {
  readonly code = "NOTIFICATION_SOURCE_UNAVAILABLE";
  constructor(message = "Notification source unavailable") {
    super(message);
    this.name = "NotificationSourceUnavailableError";
  }
}

export async function listProductionAdminNotifications(
  ctx: ApiActorContext,
): Promise<{
  items: AdminNotificationListItem[];
  truncated: boolean;
  sourceLabel: ReturnType<typeof resolveAdminDataSourceLabel>;
}> {
  if (!isProductionOperationalReadArmed()) {
    throw new NotificationSourceUnavailableError("PRODUCTION_READ_DISABLED");
  }
  const runtime = await getProductionOperationalReadRuntime();
  const repo = new FirebaseProductionNotificationReadRepository(runtime.client);
  const result = await repo.list({ scope: ctx.user.scope });
  return {
    ...result,
    sourceLabel: resolveAdminDataSourceLabel({
      productionFirestore: true,
      documentIds: result.items.map((i) => i.id),
    }),
  };
}
