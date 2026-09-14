import {
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import {
  getFinanceReportingReadService,
  mapFinanceApiError,
  parseFinanceFilters,
  toFinanceReportingActor,
} from "@/application/finance/reporting/getFinanceReportingReadService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import type { ReportExportSourceModel } from "@/domain/finance/reporting/FinanceReportingTypes";

const REPORT_TYPES: ReportExportSourceModel["reportType"][] = [
  "finance_dashboard",
  "country_finance",
  "agent_finance",
  "driver_finance",
  "settlement_summary",
  "reconciliation_indicators",
  "corrections_visibility",
];

/** GET /api/finance/export — FR7 export CSV (reports:export) */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "reports:export");
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type") ?? "finance_dashboard";
    const reportType = (REPORT_TYPES.includes(typeParam as never)
      ? typeParam
      : "finance_dashboard") as ReportExportSourceModel["reportType"];
    const filters = parseFinanceFilters(searchParams);
    const service = await getFinanceReportingReadService();
    const format = searchParams.get("format") ?? "json";
    if (format === "csv") {
      const csv = service.exportCsv(
        toFinanceReportingActor(ctx),
        reportType,
        filters,
      );
      return new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="fr7-${reportType}.csv"`,
          "x-correlation-id": ctx.correlationId,
          "x-request-id": ctx.requestId,
        },
      });
    }
    const model = service.exportSource(
      toFinanceReportingActor(ctx),
      reportType,
      filters,
    );
    return Response.json(model, {
      headers: {
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
    const mapped = mapFinanceApiError(error);
    if (mapped.status === 403) {
      return Response.json(mapped.body, { status: 403 });
    }
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
