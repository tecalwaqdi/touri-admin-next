import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getRepositories } from "@/repositories/container";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { getEnv } from "@/config/env";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import {
  mapProductionReadError,
  productionReadPathActive,
} from "@/infrastructure/http/shadowApi";
import {
  AdminAuditSourceUnavailableError,
  listProductionAdminAudit,
} from "@/application/production-read/AdminAuditReadService";
import { PRODUCTION_ADMIN_AUDIT_SOURCE } from "@/domain/audit/AdminAuditSourceDecision";

/**
 * GET /api/audit
 * Production: admin_next_cw_audit via WIF (not finance_audit_events; not synthetic).
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "audit:read");
    const env = getEnv();
    const { searchParams } = new URL(request.url);

    if (productionReadPathActive()) {
      try {
        const pageSizeRaw = Number(
          searchParams.get("pageSize") ??
            String(PRODUCTION_ADMIN_AUDIT_SOURCE.defaultPageSize),
        );
        const result = await listProductionAdminAudit(ctx, {
          pageSize: pageSizeRaw,
          cursor: searchParams.get("cursor"),
          actorUserId: searchParams.get("actor") ?? undefined,
          action: searchParams.get("action") ?? undefined,
          resourceType: searchParams.get("resourceType") ?? undefined,
          environment: searchParams.get("environment") ?? undefined,
        });
        return jsonWithIds(result, ctx);
      } catch (error) {
        if (error instanceof AdminAuditSourceUnavailableError) {
          return jsonWithIds(
            {
              items: [],
              total: 0,
              page: 1,
              pageSize: PRODUCTION_ADMIN_AUDIT_SOURCE.defaultPageSize,
              unavailable: true,
              code: error.code,
              error: error.message,
              synthetic: false,
              sourceLabel: resolveAdminDataSourceLabel({ unavailable: true }),
            },
            ctx,
            { status: 503 },
          );
        }
        return mapProductionReadError(error);
      }
    }

    if (env.APP_ENV === "production" || env.APP_ENV === "staging") {
      return jsonWithIds(
        {
          items: [],
          total: 0,
          page: 1,
          pageSize: PRODUCTION_ADMIN_AUDIT_SOURCE.defaultPageSize,
          unavailable: true,
          code: "PRODUCTION_AUDIT_SOURCE_NOT_CONFIGURED",
          error: "Production audit source not configured",
          synthetic: false,
          sourceLabel: resolveAdminDataSourceLabel({ unavailable: true }),
        },
        ctx,
        { status: 503 },
      );
    }

    const result = await getRepositories().audit.query({
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Math.min(
        Number(
          searchParams.get("pageSize") ??
            String(PRODUCTION_ADMIN_AUDIT_SOURCE.defaultPageSize),
        ),
        PRODUCTION_ADMIN_AUDIT_SOURCE.maxPageSize,
      ),
      actorUserId: searchParams.get("actor") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      resourceType: searchParams.get("resourceType") ?? undefined,
      environment: searchParams.get("environment") ?? undefined,
      fromUtc: searchParams.get("from") ?? undefined,
      toUtc: searchParams.get("to") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });
    return jsonWithIds(
      {
        ...result,
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
    return Response.json({ error: sanitizeErrorMessage(error) }, { status: 500 });
  }
}
