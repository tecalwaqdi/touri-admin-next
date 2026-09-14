import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getRepositories } from "@/repositories/container";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maskEmail } from "@/domain/pii/maskIdentity";
import { getEnv } from "@/config/env";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import { productionReadPathActive } from "@/infrastructure/http/shadowApi";

/**
 * GET /api/users — Users/Roles list (users:manage). PII masked.
 * Production: no @touri.local fixture fallback — fail closed until RO admin-user source exists.
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "users:manage");
    const env = getEnv();

    if (
      productionReadPathActive() ||
      env.APP_ENV === "production" ||
      env.APP_ENV === "staging"
    ) {
      return jsonWithIds(
        {
          items: [],
          total: 0,
          unavailable: true,
          code: "PRODUCTION_USER_SOURCE_NOT_CONFIGURED",
          error: "Production user source not configured",
          synthetic: false,
          sourceLabel: resolveAdminDataSourceLabel({ unavailable: true }),
        },
        ctx,
        { status: 503 },
      );
    }

    const users = await getRepositories().users.list();
    const items = users.map((u) => ({
      id: u.id,
      emailMasked: maskEmail(u.email),
      displayName: u.displayName,
      role: u.role,
      scopeType: u.scope.type,
      scopeCountryIds: u.scope.countryIds ?? [],
      scopeAgentIds: u.scope.agentIds ?? [],
      status: u.status,
      permissionCount: u.permissions.length,
    }));
    return jsonWithIds(
      {
        items,
        total: items.length,
        synthetic: true,
        sourceLabel: resolveAdminDataSourceLabel({ syntheticSource: true }),
      },
      ctx,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message, code: error.code }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 403 });
    }
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
