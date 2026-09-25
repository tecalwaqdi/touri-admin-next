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
import { resolveFinancePartyDisplayName } from "@/application/finance/reporting/FinancePartyDirectory";

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
    const enriched = await Promise.all(
      items.map(async (item) => ({
        ...item,
        agentLabel: await resolveFinancePartyDisplayName(
          ctx,
          "agent",
          item.agentId,
        ),
      })),
    );
    return jsonWithIds({ items: enriched, total: enriched.length }, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
