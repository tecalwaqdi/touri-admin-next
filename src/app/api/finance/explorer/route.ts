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
import type { AccountantDataClass } from "@/domain/finance/reporting/AccountantDataClassification";
import type { GlobalExplorerRecordType } from "@/domain/finance/reporting/AccountantGlobalFinancialExplorer";

const DATA_CLASSES = new Set<AccountantDataClass>([
  "certified",
  "operational",
  "historical",
  "qa_test",
  "incomplete",
  "conflict",
  "uncertified",
]);

const RECORD_TYPES = new Set<GlobalExplorerRecordType>([
  "snapshot",
  "settlement",
  "payment",
  "adjustment",
]);

/**
 * GET /api/finance/explorer — global financial explorer (finance:read).
 * Shows ALL scoped records with classification; official totals stay on dashboard.
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { searchParams } = new URL(request.url);
    const filters = parseFinanceFilters(searchParams);
    // Explorer defaults to including pilot/QA for visibility (explicit opt-out).
    if (
      searchParams.get("includePilotRecords") !== "0" &&
      searchParams.get("includePilotRecords") !== "false"
    ) {
      filters.includePilotRecords = true;
    }
    const rawClass = searchParams.get("dataClass");
    const dataClass =
      rawClass && DATA_CLASSES.has(rawClass as AccountantDataClass)
        ? (rawClass as AccountantDataClass)
        : null;
    const rawType = searchParams.get("recordType");
    const recordType =
      rawType && RECORD_TYPES.has(rawType as GlobalExplorerRecordType)
        ? (rawType as GlobalExplorerRecordType)
        : null;
    const limitRaw = Number(searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 200;
    const service = await getFinanceReportingReadService({
      countryId: filters.countryId,
    });
    const result = service.globalFinancialExplorer(
      toFinanceReportingActor(ctx),
      filters,
      { dataClass, recordType, limit },
    );
    return jsonWithIds(result, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
