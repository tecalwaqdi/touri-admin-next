import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getRepositories } from "@/repositories/container";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import {
  mapProductionReadError,
  productionReadPathActive,
} from "@/infrastructure/http/shadowApi";
import {
  AdminAuditNotFoundError,
  AdminAuditSourceUnavailableError,
  getProductionAdminAuditDetail,
} from "@/application/production-read/AdminAuditReadService";
import { redactAuditJson } from "@/domain/audit/redactAuditPayload";

/**
 * GET /api/audit/[id] — exact audit read when Production CW audit source is armed.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "audit:read");
    const { id } = await context.params;

    if (productionReadPathActive()) {
      try {
        const event = await getProductionAdminAuditDetail(ctx, id);
        return jsonWithIds(event, ctx);
      } catch (error) {
        if (error instanceof AdminAuditNotFoundError) {
          return Response.json(
            { error: "Not found", code: "AUDIT_EVENT_NOT_FOUND" },
            { status: 404 },
          );
        }
        if (error instanceof AdminAuditSourceUnavailableError) {
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
    }

    const event = await getRepositories().audit.getById(id);
    if (!event) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const safe = redactAuditJson(event);
    return jsonWithIds(safe, ctx);
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
