import { requirePermission, resolveApiActor } from "@/infrastructure/http/apiAuth";
import { getFinanceReportingReadService, toFinanceReportingActor } from "@/application/finance/reporting/getFinanceReportingReadService";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";
import { renderSettlementPrintHtml, type SettlementPrintModel } from "@/domain/reports/SettlementPrintReport";

/** Values and scope are resolved server-side; the request controls locale only. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const service = await getFinanceReportingReadService({ settlementId: id });
    const detail = service.settlement(toFinanceReportingActor(ctx), id);
    if (!detail) return Response.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    const model: SettlementPrintModel = {
      settlementId: detail.id,
      status: detail.status,
      currency: detail.currency,
      totalMinor: detail.amountMinor,
      outstandingMinor: detail.outstandingMinor,
      partyLabel: detail.partyIdToken,
      countryId: detail.countryId,
      generatedAtUtc: new Date().toISOString(),
      actorUid: ctx.user.id,
      payments: detail.payments.map(p => ({
        id: p.id, amountMinor: p.amountMinor, currency: p.currency, state: p.status,
        method: p.method ?? null, reference: p.reference ?? null,
        createdBy: p.createdBy ?? null, confirmedBy: p.confirmedBy ?? null,
        createdAtUtc: p.createdAtUtc ?? null,
      })),
    };
    return new Response(renderSettlementPrintHtml(model, body?.locale === "ar" ? "ar" : "en"), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
        "x-correlation-id": ctx.correlationId, "x-request-id": ctx.requestId,
      },
    });
  } catch (error) { return financeReportingApiErrorResponse(error); }
}
