import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
} from "@/infrastructure/http/apiAuth";
import {
  getFinanceReportingReadService,
  toFinanceReportingActor,
} from "@/application/finance/reporting/getFinanceReportingReadService";
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
    const service = await getFinanceReportingReadService();
    const detail = service.settlement(toFinanceReportingActor(ctx), id);
    if (!detail) {
      return Response.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return jsonWithIds(detail, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
