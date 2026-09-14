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
  parseFinanceFilters,
  toFinanceReportingActor,
} from "@/application/finance/reporting/getFinanceReportingReadService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";

/** GET /api/finance/agents/[agentId] — FR7 agent finance summary */
export async function GET(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { agentId } = await context.params;
    const { searchParams } = new URL(request.url);
    const countryId = searchParams.get("countryId");
    if (!countryId) {
      return Response.json(
        { error: "countryId required", code: "BAD_REQUEST" },
        { status: 400 },
      );
    }
    const filters = parseFinanceFilters(searchParams);
    const service = await getFinanceReportingReadService();
    const summary = service.agentSummary(
      toFinanceReportingActor(ctx),
      { agentId, countryId },
      filters,
    );
    return jsonWithIds(summary, ctx);
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
