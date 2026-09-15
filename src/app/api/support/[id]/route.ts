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
  getProductionSupportTicket,
  SupportSourceUnavailableError,
} from "@/application/production-read/SupportReadService";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    try {
      await requirePermission(ctx, "customers:read");
    } catch {
      await requirePermission(ctx, "users:manage");
    }
    const { id } = await context.params;

    if (!productionReadPathActive()) {
      return jsonWithIds(
        {
          unavailable: true,
          code: "PRODUCTION_READ_DISABLED",
          error: "Production support detail requires Production read",
          sourceLabel: resolveAdminDataSourceLabel({ unavailable: true }),
        },
        ctx,
        { status: 503 },
      );
    }

    try {
      const detail = await getProductionSupportTicket(ctx, id);
      return jsonWithIds(
        {
          ...detail,
          sourceLabel: resolveAdminDataSourceLabel({
            productionFirestore: true,
            documentIds: [detail.id],
          }),
        },
        ctx,
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "SUPPORT_NOT_FOUND"
      ) {
        return Response.json(
          { error: "Not found", code: "SUPPORT_NOT_FOUND" },
          { status: 404 },
        );
      }
      if (error instanceof SupportSourceUnavailableError) {
        return jsonWithIds(
          {
            unavailable: true,
            code: error.code,
            error: error.message,
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
