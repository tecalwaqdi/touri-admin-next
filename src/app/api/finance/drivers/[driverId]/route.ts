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

/** GET /api/finance/drivers/[driverId] — FR7 driver finance summary (read-only). */
export async function GET(
  request: Request,
  context: { params: Promise<{ driverId: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { driverId } = await context.params;
    if (!driverId?.trim()) {
      return Response.json(
        { error: "driverId required", code: "BAD_REQUEST" },
        { status: 400 },
      );
    }
    const { searchParams } = new URL(request.url);
    const filters = parseFinanceFilters(searchParams);
    const service = await getFinanceReportingReadService();
    const summary = service.driverSummary(
      toFinanceReportingActor(ctx),
      driverId.trim(),
      filters,
    );
    return jsonWithIds(summary, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
