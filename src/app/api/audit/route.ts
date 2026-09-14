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
import { productionReadPathActive } from "@/infrastructure/http/shadowApi";

/**
 * GET /api/audit
 * Production: no synthetic fixture events — fail closed until Production audit RO exists.
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "audit:read");
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
          page: 1,
          pageSize: 25,
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

    const { searchParams } = new URL(request.url);
    const result = await getRepositories().audit.query({
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "25"),
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
