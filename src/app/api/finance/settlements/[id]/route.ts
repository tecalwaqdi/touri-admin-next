import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
} from "@/infrastructure/http/apiAuth";
import {
  getFinanceReportingReadService,
  toFinanceReportingActor,
} from "@/application/finance/reporting/getFinanceReportingReadService";
import {
  applySettlementDisplayLabels,
  resolveSettlementPartyDisplayNames,
} from "@/application/finance/reporting/enrichSettlementPartyDisplay";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";

/** GET /api/finance/settlements/[id] — FR7 settlement detail */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get("locale") === "ar" ? "ar" : "en";
    const service = await getFinanceReportingReadService({ settlementId: id });
    const actor = toFinanceReportingActor(ctx);
    const detail = service.settlement(actor, id);
    if (!detail) {
      return Response.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const refs = service.settlementPartyRefs(actor, {});
    const matched = refs.filter((r) => r.settlementId === id);
    const partyNames = await resolveSettlementPartyDisplayNames(ctx, matched);
    const [labeled] = applySettlementDisplayLabels([detail], partyNames, locale);
    return jsonWithIds({ ...detail, ...labeled }, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
