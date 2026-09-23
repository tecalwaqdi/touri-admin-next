import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
} from "@/infrastructure/http/apiAuth";
import { getDriverWalletReadService } from "@/application/finance/wallet/DriverWalletReadService";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";
import { NextResponse } from "next/server";

/** GET /api/finance/driver-wallets/[id] — wallet + bounded ledger. */
export async function GET(
  request: Request,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { id } = await ctxParams.params;
    const service = await getDriverWalletReadService();
    const detail = await service.getById(id);
    if (!detail) {
      return NextResponse.json(
        { error: "wallet_not_found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return jsonWithIds(detail, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
