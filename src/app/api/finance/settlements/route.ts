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
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";

/** GET /api/finance/settlements — FR7 settlements list */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { searchParams } = new URL(request.url);
    const filters = parseFinanceFilters(searchParams);
    const service = await getFinanceReportingReadService();
    const actor = toFinanceReportingActor(ctx);
    const items = service.settlements(actor, filters);
    const dash = service.dashboard(actor, filters);
    const isSynthetic = dash.meta.synthetic === true;
    const sourceLabel = resolveAdminDataSourceLabel({
      syntheticSource: isSynthetic,
      productionFirestore: !isSynthetic,
      documentIds: items.map((i) => i.id),
    });
    return jsonWithIds(
      {
        items,
        total: items.length,
        synthetic: isSynthetic,
        sourceLabel,
      },
      ctx,
    );
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
