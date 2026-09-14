import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getReportService } from "@/application/services";
import type { ReportType } from "@/application/reports/ReportService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";

export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "reports:export");
    const { searchParams } = new URL(request.url);
    const reportType = (searchParams.get("type") ?? "trip_financial_summary") as ReportType;
    const filters = {
      fromUtc: searchParams.get("from") ?? undefined,
      toUtc: searchParams.get("to") ?? undefined,
      countryId: searchParams.get("countryId") ?? undefined,
      currencyCode: searchParams.get("currencyCode") ?? undefined,
      agentId: searchParams.get("agentId") ?? undefined,
      driverId: searchParams.get("driverId") ?? undefined,
    };
    const report = await getReportService().build(reportType, filters);
    return jsonWithIds(report, ctx);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message, code: error.code }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 403 });
    }
    return Response.json({ error: sanitizeErrorMessage(error) }, { status: 500 });
  }
}
