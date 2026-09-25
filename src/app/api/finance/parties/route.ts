import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
} from "@/infrastructure/http/apiAuth";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";
import { listFinancePartyDirectory } from "@/application/finance/reporting/FinancePartyDirectory";

/**
 * GET /api/finance/parties — searchable driver/agent directory for finance filters.
 * finance:read only (no drivers:read / agents:read grant).
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { searchParams } = new URL(request.url);
    const partyTypeRaw = searchParams.get("partyType") ?? "driver";
    const partyType =
      partyTypeRaw === "agent" ? ("agent" as const) : ("driver" as const);
    const items = await listFinancePartyDirectory(ctx, {
      partyType,
      search: searchParams.get("q") ?? searchParams.get("search"),
      countryId: searchParams.get("countryId"),
      locale: searchParams.get("locale") === "ar" ? "ar" : "en",
      limit: Number(searchParams.get("limit") ?? "30"),
    });
    return jsonWithIds({ items }, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
