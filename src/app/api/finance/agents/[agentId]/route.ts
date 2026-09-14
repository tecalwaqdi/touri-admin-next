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
    return financeReportingApiErrorResponse(error);
  }
}
