import {
  resolveApiActor,
  requirePermission,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getReportService } from "@/application/services";
import type { ReportType } from "@/application/reports/ReportService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import { getEnv } from "@/config/env";

export async function GET(request: Request) {
  const env = getEnv();
  if (env.PRODUCTION_READ_MODE === "shadow") {
    return Response.json(
      { error: "SHADOW_EXPORT_DISABLED", code: "SHADOW_EXPORT_DISABLED" },
      { status: 403 },
    );
  }
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

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
    const { csv } = await getReportService().exportCsv(
      ctx.user,
      reportType,
      filters,
      ctx.correlationId,
    );
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${reportType}.csv"`,
        "x-correlation-id": ctx.correlationId,
        "x-request-id": ctx.requestId,
      },
    });
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
