import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import {
  mapProductionReadError,
  productionReadPathActive,
} from "@/infrastructure/http/shadowApi";
import {
  AdminUserNotFoundError,
  AdminUserSourceUnavailableError,
  getProductionAdminUserDetail,
} from "@/application/production-read/AdminUserReadService";
import { ScopeDeniedError } from "@/infrastructure/production/repositories/productionReadHelpers";

/**
 * GET /api/users/[id] — exact Admin User lookup (users:manage).
 * Non-admin personas → 404. Out of scope → 403. Source down → 503.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "users:manage");
    const { id } = await context.params;

    if (!productionReadPathActive()) {
      return jsonWithIds(
        {
          unavailable: true,
          code: "PRODUCTION_USER_SOURCE_NOT_CONFIGURED",
          error: "Production user detail requires Production read",
          synthetic: false,
          sourceLabel: resolveAdminDataSourceLabel({ unavailable: true }),
        },
        ctx,
        { status: 503 },
      );
    }

    try {
      const detail = await getProductionAdminUserDetail(ctx, id);
      return jsonWithIds(detail, ctx);
    } catch (error) {
      if (error instanceof AdminUserNotFoundError) {
        return Response.json(
          { error: "Not found", code: "ADMIN_USER_NOT_FOUND" },
          { status: 404 },
        );
      }
      if (error instanceof ScopeDeniedError) {
        return Response.json(
          { error: "Scope denied", code: "SCOPE_DENIED" },
          { status: 403 },
        );
      }
      if (error instanceof AdminUserSourceUnavailableError) {
        return jsonWithIds(
          {
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
