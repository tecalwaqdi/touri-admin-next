/**
 * Production Admin notifications RO — `admin_panel_notifications` via WIF.
 */

import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import {
  mapAdminNotificationDocument,
  type AdminNotificationListItem,
} from "@/domain/notifications/AdminNotificationMapping";
import type { AccessScope } from "@/types/roles";
import { countryIdAllowedByScope } from "@/application/production-read/detailScope";

export class FirebaseProductionNotificationReadRepository {
  constructor(private readonly client: FirestoreReadClient) {}

  async list(input: {
    scope: AccessScope;
  }): Promise<{ items: AdminNotificationListItem[]; truncated: boolean }> {
    const result = await this.client.query({
      collection: "admin_panel_notifications",
      limit: WIF_NATIVE_MAX_READ_LIMIT,
      orderBy: [{ field: "createdAt", direction: "desc" }],
    });
    const items: AdminNotificationListItem[] = [];
    for (const doc of result.docs) {
      if (!doc.exists || !doc.data) continue;
      const item = mapAdminNotificationDocument({
        id: doc.id,
        data: doc.data,
      });
      if (input.scope.type === "global") {
        items.push(item);
        continue;
      }
      if (
        !item.countryId ||
        countryIdAllowedByScope(input.scope.countryIds, item.countryId)
      ) {
        items.push(item);
      }
    }
    return { items, truncated: !!result.nextCursor };
  }
}
