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
import {
  applySettlementDisplayLabels,
  resolveSettlementPartyDisplayNames,
} from "@/application/finance/reporting/enrichSettlementPartyDisplay";
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
    const refs = service.settlementPartyRefs(actor, filters);
    const partyNames = await resolveSettlementPartyDisplayNames(ctx, refs);
    const locale = searchParams.get("locale") === "ar" ? "ar" : "en";
    const labeled = applySettlementDisplayLabels(items, partyNames, locale);
    const dash = service.dashboard(actor, filters);
    const isSynthetic = dash.meta.synthetic === true;
    const sourceLabel = resolveAdminDataSourceLabel({
      syntheticSource: isSynthetic,
      productionFirestore: !isSynthetic,
      containsPilotRecords: dash.meta.containsPilotRecords === true,
      documentIds: labeled.map((i) => i.id),
    });
    return jsonWithIds(
      {
        items: labeled,
        total: labeled.length,
        synthetic: isSynthetic,
        sourceLabel,
      },
      ctx,
    );
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
