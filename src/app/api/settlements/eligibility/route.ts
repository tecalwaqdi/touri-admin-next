import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getSettlementService } from "@/application/services";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { toFinancialTripDto } from "@/domain/finance/serializeFinancialTrip";

export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "settlements:create");
    const { searchParams } = new URL(request.url);
    const partyType = searchParams.get("partyType") as "driver" | "agent";
    const partyId = searchParams.get("partyId");
    const currencyCode = searchParams.get("currencyCode");
    const periodFromUtc = searchParams.get("periodFromUtc");
    const periodToUtc = searchParams.get("periodToUtc");
    const countryId = searchParams.get("countryId") ?? undefined;
    if (!partyType || !partyId || !currencyCode || !periodFromUtc || !periodToUtc) {
      return Response.json({ error: "Missing required query params" }, { status: 400 });
    }
    const result = await getSettlementService().previewEligibility({
      partyType,
      partyId,
      currencyCode,
      periodFromUtc,
      periodToUtc,
      countryId,
    });
    return jsonWithIds(
      {
        eligible: result.eligible.map(toFinancialTripDto),
        excluded: result.excluded,
        synthetic: true,
      },
      ctx,
    );
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
