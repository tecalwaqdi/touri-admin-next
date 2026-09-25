import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
} from "@/infrastructure/http/apiAuth";
import { getDriverWalletReadService } from "@/application/finance/wallet/DriverWalletReadService";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";
import { resolveFinancePartyDisplayName } from "@/application/finance/reporting/FinancePartyDirectory";

/** GET /api/finance/driver-wallets — RO driver wallets (Finance SoT adjacent). */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { searchParams } = new URL(request.url);
    const service = await getDriverWalletReadService();
    const result = await service.list({
      countryId: searchParams.get("countryId"),
      driverId: searchParams.get("driverId"),
      limit: Number(searchParams.get("limit") ?? "50"),
    });
    const items = await Promise.all(
      result.items.map(async (item) => {
        const driverLabel = item.driverId
          ? await resolveFinancePartyDisplayName(ctx, "driver", item.driverId)
          : null;
        return {
          ...item,
          driverLabel,
        };
      }),
    );
    return jsonWithIds({ ...result, items }, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
