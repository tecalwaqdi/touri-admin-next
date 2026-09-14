import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
} from "@/infrastructure/http/apiAuth";
import {
  getFinanceReportingReadService,
  parseFinanceFilters,
  toFinanceReportingActor,
} from "@/application/finance/reporting/getFinanceReportingReadService";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";

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
    return financeReportingApiErrorResponse(error);
  }
}
