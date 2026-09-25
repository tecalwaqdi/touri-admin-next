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

/**
 * GET /api/finance/agent-accounts — distinct agents in country from certified FR7.
 * Requires countryId. finance:read.
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { searchParams } = new URL(request.url);
    const filters = parseFinanceFilters(searchParams);
    const service = await getFinanceReportingReadService();
    const items = service.agentAccountDirectory(
      toFinanceReportingActor(ctx),
      filters,
    );
    return jsonWithIds({ items, total: items.length }, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
