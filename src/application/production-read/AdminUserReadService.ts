/**
 * PC-4 — AdminUserReadService — Production RO list/detail via WIF.
 */

import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  getProductionOperationalReadRuntime,
  isProductionOperationalReadArmed,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import { FirebaseProductionAdminUserReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionAdminUserReadRepository";
import {
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import { PRODUCTION_ADMIN_USER_SOURCE } from "@/domain/admin-users/AdminUserSourceDecision";
import type {
  AdminUserDetailDto,
  AdminUserListResponse,
} from "@/domain/admin-users/AdminUserDtos";
import {
  ScopeDeniedError,
  enforceLiveShadowResource,
} from "@/infrastructure/production/repositories/productionReadHelpers";

export class AdminUserSourceUnavailableError extends Error {
  readonly code = "PRODUCTION_USER_SOURCE_UNAVAILABLE";
  constructor(message = "Production admin user source unavailable") {
    super(message);
    this.name = "AdminUserSourceUnavailableError";
  }
}

export class AdminUserNotFoundError extends Error {
  readonly code = "ADMIN_USER_NOT_FOUND";
  constructor(readonly userId: string) {
    super(`Admin user not found: ${userId}`);
    this.name = "AdminUserNotFoundError";
  }
}

export async function listProductionAdminUsers(
  ctx: ApiActorContext,
): Promise<AdminUserListResponse> {
  if (!isProductionOperationalReadArmed()) {
    throw new AdminUserSourceUnavailableError("PRODUCTION_READ_DISABLED");
  }
  const runtime = await getProductionOperationalReadRuntime();
  enforceLiveShadowResource(runtime.liveShadowAllowedResources, "users");
  const repo = new FirebaseProductionAdminUserReadRepository(runtime.client);
  const result = await repo.list({
    scope: ctx.user.scope,
    actorUid: ctx.user.id,
  });
  const documentIds = result.items.map((i) => i.id);
  const sourceLabel = resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds,
  });
  return {
    items: result.items,
    total: result.items.length,
    truncated: result.truncated,
    nextCursor: result.nextCursor,
    unavailable: false,
    synthetic: false,
    sourceLabel,
    sourceEnvironment: "production",
    sourceSystem: "legacy",
    transport: "wif_native",
    bounded: true,
    maxItems: PRODUCTION_ADMIN_USER_SOURCE.maxItems,
    dataQualityWarnings: result.dataQualityWarnings,
  };
}

export async function getProductionAdminUserDetail(
  ctx: ApiActorContext,
  userId: string,
): Promise<AdminUserDetailDto> {
  if (!isProductionOperationalReadArmed()) {
    throw new AdminUserSourceUnavailableError("PRODUCTION_READ_DISABLED");
  }
  const runtime = await getProductionOperationalReadRuntime();
  enforceLiveShadowResource(runtime.liveShadowAllowedResources, "users");
  const repo = new FirebaseProductionAdminUserReadRepository(runtime.client);
  const result = await repo.getById(
    { scope: ctx.user.scope, actorUid: ctx.user.id },
    userId,
  );
  if (result.kind === "not_found") {
    throw new AdminUserNotFoundError(userId);
  }
  if (result.kind === "forbidden") {
    throw new ScopeDeniedError("admin user outside authorized scope");
  }
  const sourceLabel = resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds: [result.item.id],
  });
  return {
    ...result.item,
    availability: "available",
    sourceLabel,
    sourceEnvironment: "production",
    sourceSystem: "legacy",
    transport: "wif_native",
    synthetic: false,
    piiRedacted: true,
    permissions: result.permissions,
  };
}
