import {
  requirePermission,
  resolveApiActor,
} from "@/infrastructure/http/apiAuth";
import {
  getFinanceReportingReadService,
  parseFinanceFilters,
  toFinanceReportingActor,
} from "@/application/finance/reporting/getFinanceReportingReadService";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";
import type { ReportExportSourceModel } from "@/domain/finance/reporting/FinanceReportingTypes";
import { rowsToCsv } from "@/application/reports/ReportService";
import { presentReportExportHeaders } from "@/domain/presentation/financeTerminology";
import type { FinanceLocale } from "@/domain/presentation/financeTerminology";

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
    const localeParam = searchParams.get("locale");
    const locale: FinanceLocale = localeParam === "ar" ? "ar" : "en";
    if (format === "csv") {
      // Presentation boundary only: localize headers; keep machine-safe row values.
      // Domain exportSource / service.exportCsv internals remain unchanged for FR7 tests.
      const model = service.exportSource(
        toFinanceReportingActor(ctx),
        reportType,
        filters,
      );
      const headers = presentReportExportHeaders(model.headers, locale);
      const csv = rowsToCsv(headers, model.rows);
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
    return financeReportingApiErrorResponse(error);
  }
}
