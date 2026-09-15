/**
 * PC-4 — Production Admin User RO repository (WIF-native, Legacy `user`).
 * Bounded discriminator union; no Auth enumeration; no writes.
 */

import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import {
  ADMIN_USER_DISCRIMINATOR_QUERIES,
  PRODUCTION_ADMIN_USER_SOURCE,
} from "@/domain/admin-users/AdminUserSourceDecision";
import {
  classifyAdminPanelPersona,
  resolveAdminDisplayName,
  resolveAdminUserStatus,
} from "@/domain/admin-users/AdminPanelPersona";
import type { AdminUserListItem } from "@/domain/admin-users/AdminUserDtos";
import { maskEmail } from "@/domain/pii/maskIdentity";
import { permissionsForRole } from "@/permissions/rbac";
import type { AccessScope } from "@/types/roles";
import {
  countryIdAllowedByScope,
} from "@/application/production-read/detailScope";

export type AdminUserReadContext = {
  scope: AccessScope;
  actorUid: string;
};

export type AdminUserListRepoResult = {
  items: AdminUserListItem[];
  truncated: boolean;
  nextCursor: null;
  dataQualityWarnings: string[];
};

function toListItem(
  id: string,
  data: Record<string, unknown>,
): AdminUserListItem | null {
  try {
    const emailRaw =
      typeof data.email === "string"
        ? data.email
        : typeof data.Email === "string"
          ? data.Email
          : null;
    const classified = classifyAdminPanelPersona({ id, data, email: emailRaw });
    if (!classified.included) return null;
    return {
      id,
      emailMasked: maskEmail(emailRaw),
      displayName: resolveAdminDisplayName(data, id),
      role: classified.role,
      scopeType: classified.scope.type,
      scopeCountryIds: classified.scope.countryIds ?? [],
      scopeAgentIds: classified.scope.agentIds ?? [],
      status: resolveAdminUserStatus(data),
      permissionCount: classified.permissionCount,
      legacyRule: classified.legacyRule,
      dataQualityWarnings: classified.dataQualityWarnings,
      roleSource: "server_panel_claims_mirror",
    };
  } catch {
    // Dirty/malformed persona must not crash the whole Users list.
    return null;
  }
}

function inActorScope(
  actorScope: AccessScope,
  item: AdminUserListItem,
): boolean {
  if (actorScope.type === "global") return true;
  if (actorScope.type === "country") {
    // Global-scoped admin users (super_admin / accountant) visible to country actors? No — fail closed.
    if (item.scopeType === "global") return false;
    const country =
      item.scopeCountryIds[0] ?? null;
    return countryIdAllowedByScope(actorScope.countryIds, country);
  }
  if (actorScope.type === "agent") {
    return (
      !!item.id &&
      (actorScope.agentIds ?? []).includes(item.id)
    );
  }
  return false;
}

export class FirebaseProductionAdminUserReadRepository {
  constructor(private readonly client: FirestoreReadClient) {}

  async list(ctx: AdminUserReadContext): Promise<AdminUserListRepoResult> {
    const byId = new Map<string, AdminUserListItem>();
    const dq: string[] = [];
    let anyTruncated = false;

    for (const q of ADMIN_USER_DISCRIMINATOR_QUERIES) {
      let result;
      try {
        result = await this.client.query({
          collection: PRODUCTION_ADMIN_USER_SOURCE.collection,
          filters: [{ field: q.field, op: "==", value: q.value }],
          orderBy: [{ field: "__name__", direction: "asc" }],
          limit: WIF_NATIVE_MAX_READ_LIMIT,
        });
      } catch {
        // One discriminator query failure must not 500 the whole directory.
        dq.push(`query_failed:${q.field}=${String(q.value)}`);
        continue;
      }
      if (result.nextCursor) anyTruncated = true;
      for (const doc of result.docs) {
        if (!doc.exists || !doc.data) continue;
        const item = toListItem(doc.id, doc.data);
        if (!item) {
          // Queried as candidate but failed classification — warn, do not invent role.
          dq.push(`excluded_after_query:${doc.id}`);
          continue;
        }
        if (!inActorScope(ctx.scope, item)) continue;
        const prev = byId.get(item.id);
        if (!prev) {
          byId.set(item.id, item);
        } else {
          byId.set(item.id, {
            ...prev,
            dataQualityWarnings: [
              ...new Set([
                ...prev.dataQualityWarnings,
                ...item.dataQualityWarnings,
              ]),
            ],
          });
        }
      }
    }

    const items = [...byId.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, PRODUCTION_ADMIN_USER_SOURCE.maxItems);

    if (byId.size > PRODUCTION_ADMIN_USER_SOURCE.maxItems) {
      anyTruncated = true;
    }

    return {
      items,
      truncated: anyTruncated,
      nextCursor: null,
      dataQualityWarnings: [...new Set(dq)].slice(0, 20),
    };
  }

  async getById(
    ctx: AdminUserReadContext,
    id: string,
  ): Promise<
    | { kind: "found"; item: AdminUserListItem; permissions: string[] }
    | { kind: "not_found" }
    | { kind: "forbidden" }
  > {
    const snap = await this.client.getDocument(
      PRODUCTION_ADMIN_USER_SOURCE.collection,
      id,
    );
    if (!snap.exists || !snap.data) {
      return { kind: "not_found" };
    }
    const item = toListItem(snap.id, snap.data);
    if (!item) {
      // Non-admin persona — do not leak existence as admin user.
      return { kind: "not_found" };
    }
    if (!inActorScope(ctx.scope, item)) {
      return { kind: "forbidden" };
    }
    return {
      kind: "found",
      item,
      permissions: permissionsForRole(item.role),
    };
  }
}
