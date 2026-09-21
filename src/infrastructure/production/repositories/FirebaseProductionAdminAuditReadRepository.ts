/**
 * PC-4 — Production Admin Audit RO repository (admin_next_cw_audit via WIF).
 * Bounded list + exact getById. Finance audit not merged.
 */

import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { PRODUCTION_ADMIN_AUDIT_SOURCE } from "@/domain/audit/AdminAuditSourceDecision";
import {
  mapControlledWriteAuditToEvent,
  matchesAuditFilters,
} from "@/domain/audit/mapControlledWriteAuditToEvent";
import { redactAuditJson } from "@/domain/audit/redactAuditPayload";
import type { AuditEvent } from "@/types/audit";

export type AdminAuditListQuery = {
  pageSize: number;
  cursor?: string | null;
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  environment?: string;
};

export type AdminAuditListRepoResult = {
  items: AuditEvent[];
  nextCursor: string | null;
  truncated: boolean;
  pageSize: number;
  filterScope: "loaded_page";
};

function clampPageSize(raw: number): number {
  const n = Number.isFinite(raw) ? Math.floor(raw) : PRODUCTION_ADMIN_AUDIT_SOURCE.defaultPageSize;
  return Math.min(
    Math.max(1, n),
    PRODUCTION_ADMIN_AUDIT_SOURCE.maxPageSize,
  );
}

export class FirebaseProductionAdminAuditReadRepository {
  constructor(private readonly client: FirestoreReadClient) {}

  async list(query: AdminAuditListQuery): Promise<AdminAuditListRepoResult> {
    const pageSize = clampPageSize(query.pageSize);
    // Fetch slightly more when filters present so loaded-page filter still useful.
    const fetchLimit = Math.min(
      PRODUCTION_ADMIN_AUDIT_SOURCE.maxPageSize,
      query.actorUserId || query.action || query.resourceType || query.environment
        ? PRODUCTION_ADMIN_AUDIT_SOURCE.maxPageSize
        : pageSize,
    );

    // Prefer createdAtUtc desc (single-field auto-index). Avoid __name__ DESC —
    // Production returns FAILED_PRECONDITION requiring a composite index, and the
    // previous catch swallowed that into a fake empty audit log.
    const strategies: Array<{
      orderBy: Array<{ field: string; direction: "asc" | "desc" }>;
      reverse: boolean;
    }> = [
      {
        orderBy: [{ field: "createdAtUtc", direction: "desc" }],
        reverse: false,
      },
      {
        orderBy: [{ field: "__name__", direction: "asc" }],
        reverse: true,
      },
    ];

    let result: Awaited<ReturnType<FirestoreReadClient["query"]>> | null = null;
    let reverse = false;
    let lastError: unknown;
    for (const strategy of strategies) {
      try {
        result = await this.client.query({
          collection: PRODUCTION_ADMIN_AUDIT_SOURCE.collection,
          filters: [],
          orderBy: strategy.orderBy,
          limit: fetchLimit,
          startAfterCursor: query.cursor ?? null,
        });
        reverse = strategy.reverse;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!result) {
      // eslint-disable-next-line no-console -- safe diagnostics for Vercel runtime-logs
      console.error(
        JSON.stringify({
          level: "error",
          event: "admin_audit_list_query_failed",
          message:
            lastError instanceof Error
              ? lastError.message.slice(0, 300)
              : "query failed",
        }),
      );
      return {
        items: [],
        nextCursor: null,
        truncated: false,
        pageSize,
        filterScope: "loaded_page",
      };
    }

    const docs = reverse ? [...result.docs].reverse() : result.docs;
    const items: AuditEvent[] = [];
    for (const d of docs) {
      if (!d.exists || !d.data) continue;
      try {
        const ev = mapControlledWriteAuditToEvent({ id: d.id, data: d.data });
        if (
          matchesAuditFilters(ev, {
            actorUserId: query.actorUserId,
            action: query.action,
            resourceType: query.resourceType,
            environment: query.environment,
          })
        ) {
          items.push(ev);
        }
      } catch {
        // Malformed CW audit docs must not crash the entire list.
        continue;
      }
      if (items.length >= pageSize) break;
    }

    return {
      items,
      // Cursor for createdAtUtc strategy stays server-side; reversed __name__ pages
      // are best-effort newest-first without inventing a new cursor scheme.
      nextCursor: reverse ? null : result.nextCursor,
      truncated: reverse
        ? docs.length >= fetchLimit
        : result.nextCursor != null || result.docs.length >= fetchLimit,
      pageSize,
      filterScope: "loaded_page",
    };
  }

  async getById(id: string): Promise<AuditEvent | null> {
    const snap = await this.client.getDocument(
      PRODUCTION_ADMIN_AUDIT_SOURCE.collection,
      id,
    );
    if (!snap.exists || !snap.data) return null;
    const event = mapControlledWriteAuditToEvent({
      id: snap.id,
      data: snap.data,
    });
    return redactAuditJson(event) as AuditEvent;
  }
}
