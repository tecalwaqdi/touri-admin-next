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

    const result = await this.client.query({
      collection: PRODUCTION_ADMIN_AUDIT_SOURCE.collection,
      filters: [],
      orderBy: [{ field: "__name__", direction: "desc" }],
      limit: fetchLimit,
      startAfterCursor: query.cursor ?? null,
    });

    const items = result.docs
      .filter((d) => d.exists && d.data)
      .map((d) =>
        mapControlledWriteAuditToEvent({ id: d.id, data: d.data! }),
      )
      .filter((ev) =>
        matchesAuditFilters(ev, {
          actorUserId: query.actorUserId,
          action: query.action,
          resourceType: query.resourceType,
          environment: query.environment,
        }),
      )
      .slice(0, pageSize);


    return {
      items,
      nextCursor: result.nextCursor,
      truncated: result.nextCursor != null || result.docs.length >= fetchLimit,
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
