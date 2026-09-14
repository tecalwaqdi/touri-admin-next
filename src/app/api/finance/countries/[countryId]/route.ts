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

/** GET /api/finance/countries/[countryId] — FR7 country summary + 1-agent invariant */
export async function GET(
  request: Request,
  context: { params: Promise<{ countryId: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { countryId } = await context.params;
    const { searchParams } = new URL(request.url);
    const filters = parseFinanceFilters(searchParams);
    const service = await getFinanceReportingReadService();
    const summary = service.countrySummary(
      toFinanceReportingActor(ctx),
      countryId,
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
