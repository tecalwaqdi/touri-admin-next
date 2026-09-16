import {
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import {
  renderSettlementPrintHtml,
  type SettlementPrintModel,
} from "@/domain/reports/SettlementPrintReport";

/**
 * Printable A4 settlement receipt — uses request-provided canonical FR7 values
 * (no React money calc). Production detail fetch remains via finance read APIs.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { id } = await context.params;

    const body = (await request.json().catch(() => ({}))) as Partial<SettlementPrintModel> & {
      locale?: "en" | "ar";
    };

    const model: SettlementPrintModel = {
      settlementId: id,
      status: body.status ?? "unknown",
      currency: body.currency ?? "XXX",
      totalMinor: body.totalMinor ?? null,
      outstandingMinor: body.outstandingMinor ?? null,
      partyLabel: body.partyLabel ?? null,
      countryId: body.countryId ?? null,
      generatedAtUtc: new Date().toISOString(),
      actorUid: ctx.user.id,
      payments: body.payments ?? [],
    };

    const html = renderSettlementPrintHtml(model, body.locale === "ar" ? "ar" : "en");
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-correlation-id": ctx.correlationId,
        "x-request-id": ctx.requestId,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }
    if (error instanceof AuthorizationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
