import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import {
  getFinanceReportingReadService,
  mapFinanceApiError,
  toFinanceReportingActor,
} from "@/application/finance/reporting/getFinanceReportingReadService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";

/** GET /api/finance/settlements/[id] — FR7 settlement detail */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { id } = await context.params;
    const service = await getFinanceReportingReadService();
    const detail = service.settlement(toFinanceReportingActor(ctx), id);
    if (!detail) {
      return Response.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return jsonWithIds(detail, ctx);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message, code: error.code }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 403 });
    }
    const mapped = mapFinanceApiError(error);
    if (mapped.status === 403) {
      return Response.json(mapped.body, { status: 403 });
    }
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
