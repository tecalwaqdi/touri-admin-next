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
import { getDriverWalletReadService } from "@/application/finance/wallet/DriverWalletReadService";
import {
  mergeFinancialMovements,
  projectWalletLedgerMovements,
} from "@/domain/finance/reporting/AccountantFinancialLedger";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";

/**
 * GET /api/finance/ledger — settlement payments + bounded wallet ledger movements.
 * finance:read. No balance invention.
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { searchParams } = new URL(request.url);
    const filters = parseFinanceFilters(searchParams);
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") ?? "100") || 100, 1),
      200,
    );
    const service = await getFinanceReportingReadService();
    const actor = toFinanceReportingActor(ctx);
    const payments = service.settlementPaymentMovements(actor, filters);

    let walletMoves = projectWalletLedgerMovements([], filters);
    if (filters.driverId) {
      const wallets = await getDriverWalletReadService();
      const listed = await wallets.list({
        driverId: filters.driverId,
        countryId: filters.countryId,
        limit: 20,
      });
      const ledgers = [];
      for (const w of listed.items.slice(0, 5)) {
        const detail = await wallets.getById(w.walletId);
        if (detail?.ledger?.length) ledgers.push(...detail.ledger);
      }
      walletMoves = projectWalletLedgerMovements(ledgers, filters);
    }

    const items = mergeFinancialMovements(payments, walletMoves).slice(0, limit);
    return jsonWithIds({ items, total: items.length, bounded: true }, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
