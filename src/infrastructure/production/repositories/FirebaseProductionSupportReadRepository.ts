/**
 * Production Support ticket RO — Firestore `support` via WIF.
 */

import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import {
  mapSupportDocumentToDetail,
  mapSupportDocumentToListItem,
  type SupportTicketDetail,
  type SupportTicketListItem,
} from "@/domain/support/SupportTicketMapping";
import type { AccessScope } from "@/types/roles";
import { countryIdAllowedByScope } from "@/application/production-read/detailScope";

export class FirebaseProductionSupportReadRepository {
  constructor(private readonly client: FirestoreReadClient) {}

  async list(input: {
    scope: AccessScope;
  }): Promise<{ items: SupportTicketListItem[]; truncated: boolean }> {
    let result;
    try {
      result = await this.client.query({
        collection: "support",
        limit: WIF_NATIVE_MAX_READ_LIMIT,
        orderBy: [{ field: "__name__", direction: "desc" }],
      });
    } catch (err) {
      // Empty-collection contract: do not 500 Support list on query infra blips.
      // eslint-disable-next-line no-console -- safe diagnostics for Vercel runtime-logs
      console.error(
        JSON.stringify({
          level: "error",
          event: "support_list_query_failed",
          message:
            err instanceof Error ? err.message.slice(0, 300) : "query failed",
        }),
      );
      return { items: [], truncated: false };
    }
    const items: SupportTicketListItem[] = [];
    for (const doc of result.docs) {
      if (!doc.exists || !doc.data) continue;
      let item: SupportTicketListItem;
      try {
        item = mapSupportDocumentToListItem({
          id: doc.id,
          data: doc.data,
        });
      } catch {
        // Dirty/unrelated docs must not crash the Support list.
        continue;
      }
      if (input.scope.type === "global") {
        items.push(item);
        continue;
      }
      if (countryIdAllowedByScope(input.scope.countryIds, item.countryId)) {
        items.push(item);
      }
    }
    return { items, truncated: !!result.nextCursor };
  }

  async getById(input: {
    id: string;
    scope: AccessScope;
  }): Promise<SupportTicketDetail | null> {
    const doc = await this.client.getDocument("support", input.id);
    if (!doc.exists || !doc.data) return null;
    const detail = mapSupportDocumentToDetail({
      id: doc.id,
      data: doc.data,
    });
    if (input.scope.type === "global") return detail;
    if (!countryIdAllowedByScope(input.scope.countryIds, detail.countryId)) {
      return null;
    }
    return detail;
  }
}
