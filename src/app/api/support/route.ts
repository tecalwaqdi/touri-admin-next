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
  listProductionSupportTickets,
  SupportSourceUnavailableError,
} from "@/application/production-read/SupportReadService";

/**
 * GET /api/support — support tickets list (customers:read or users:manage).
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    try {
      await requirePermission(ctx, "customers:read");
    } catch {
      await requirePermission(ctx, "users:manage");
    }

    if (productionReadPathActive()) {
      try {
        const result = await listProductionSupportTickets(ctx);
        return jsonWithIds(
          {
            items: result.items,
            total: result.items.length,
            truncated: result.truncated,
            synthetic: false,
            sourceLabel: result.sourceLabel,
          },
          ctx,
        );
      } catch (error) {
        if (error instanceof SupportSourceUnavailableError) {
          return jsonWithIds(
            {
              items: [],
              total: 0,
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

    return jsonWithIds(
      {
        items: [],
        total: 0,
        truncated: false,
        synthetic: true,
        sourceLabel: resolveAdminDataSourceLabel({ syntheticSource: true }),
        notice: "Support list uses Production read when armed",
      },
      ctx,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }
    if (error instanceof AuthorizationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
