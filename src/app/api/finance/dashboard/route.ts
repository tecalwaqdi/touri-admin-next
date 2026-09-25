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
import { collectFinanceForwardDiagnostics } from "@/application/finance/reporting/FinanceForwardDiagnostics";
import { createWifAccountingSnapshotMaterializePorts } from "@/adapters/finance/materialize/WifAccountingSnapshotMaterializeAdapters";
import { resolveFinanceReportingSourceMode } from "@/application/finance/reporting/FinanceReportingSourceMode";
import type { FinanceDashboardSummary } from "@/domain/finance/reporting/FinanceReportingTypes";

/** GET /api/finance/dashboard — FR7 FinanceReportingReadService.dashboard + forward diagnostics */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { searchParams } = new URL(request.url);
    const filters = parseFinanceFilters(searchParams);
    const service = await getFinanceReportingReadService();
    const actor = toFinanceReportingActor(ctx);
    const summary = service.dashboard(
      actor,
      filters,
    ) as FinanceDashboardSummary & { driverNet?: ReturnType<typeof service.companyDriverNet> };

    summary.driverNet = service.companyDriverNet(actor, filters);

    // Overlay isolation counters from bounded order scan (never mixed into company totals).
    try {
      const mode = resolveFinanceReportingSourceMode();
      if (mode === "production_read_only") {
        const ports = await createWifAccountingSnapshotMaterializePorts();
        const read = ports.read as typeof ports.read & {
          listOrdersPage?: (input: {
            limit: number;
            cursor: string | null;
          }) => Promise<{
            docs: Array<{ id: string; data: Record<string, unknown> }>;
            nextCursor: string | null;
          }>;
        };
        if (typeof read.listOrdersPage === "function") {
          const diag = await collectFinanceForwardDiagnostics({
            port: {
              listOrdersPage: (input) => read.listOrdersPage!(input),
              getSnapshotExists: async (orderId) => {
                const snap = await read.getSnapshot(orderId);
                return snap.exists;
              },
            },
            maxPages: 4,
            pageSize: 50,
          });
          summary.historicalIncompleteCount = diag.historicalIncompleteCount;
          summary.financialConflictCount = diag.financialConflictCount;
          summary.pendingUncollectedCount = diag.pendingUncollectedCount;
          summary.certifiedReadyAwaitingSnapshotCount =
            diag.certifiedReadyAwaitingSnapshotCount;
          if (diag.certifiedSnapshotCount > 0) {
            summary.certifiedSnapshotCount = diag.certifiedSnapshotCount;
          }
        }
      }
    } catch {
      // Diagnostics optional — certified company totals remain valid without them.
    }

    return jsonWithIds(summary, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
