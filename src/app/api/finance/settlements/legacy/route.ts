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
import {
  LEGACY_ORPHAN_REASON_AR,
  LEGACY_SECTION_TITLE_AR,
  LEGACY_SECTION_TITLE_EN,
} from "@/domain/finance/reporting/SettlementCommercialCutover";

/**
 * GET /api/finance/settlements/legacy — super_admin diagnostics only.
 * Read-only orphan/legacy settlements (no approve / payment / mutation).
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    if (ctx.user.role !== "super_admin") {
      return Response.json(
        {
          error: "super_admin required for legacy settlements",
          code: "RBAC_DENIED",
        },
        { status: 403 },
      );
    }
    const { searchParams } = new URL(request.url);
    const filters = parseFinanceFilters(searchParams);
    const service = await getFinanceReportingReadService();
    const items = service.legacyOrphanSettlements(
      toFinanceReportingActor(ctx),
      filters,
    );
    return jsonWithIds(
      {
        items,
        total: items.length,
        readOnly: true,
        sectionTitleAr: LEGACY_SECTION_TITLE_AR,
        sectionTitleEn: LEGACY_SECTION_TITLE_EN,
        reasonAr: LEGACY_ORPHAN_REASON_AR,
      },
      ctx,
    );
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
