import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
} from "@/infrastructure/http/apiAuth";
import { getDriverWalletReadService } from "@/application/finance/wallet/DriverWalletReadService";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";
import { resolveOperationalDisplayName } from "@/domain/presentation/operationalDisplayName";
import {
  getProductionOperationalReadRuntime,
  isProductionOperationalReadArmed,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";

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

    const canEnrich = isProductionOperationalReadArmed();
    const runtime = canEnrich
      ? await getProductionOperationalReadRuntime()
      : null;
    const readCtx = canEnrich ? productionReadContextFromActor(ctx) : null;

    const items = await Promise.all(
      result.items.map(async (item) => {
        let driverLabel =
          item.driverDisplayName?.trim() || null;
        let countryId = item.countryId;
        let status = item.status;

        if (runtime && readCtx && item.driverId) {
          try {
            const env = await runtime.repos.drivers.getById(
              readCtx,
              item.driverId,
            );
            if (env) {
              driverLabel =
                resolveOperationalDisplayName({
                  displayName: env.data.displayName.value,
                  id: env.data.id,
                }) || driverLabel;
              if (!countryId) {
                countryId = env.data.countryId.value ?? null;
              }
              if (!status) {
                status =
                  env.data.accountEnabled !== "unknown"
                    ? env.data.accountEnabled
                    : env.data.onlineStatus !== "unknown"
                      ? env.data.onlineStatus
                      : env.data.registrationStatus || null;
              }
            }
          } catch {
            // fail-soft enrichment
          }
        }

        return {
          ...item,
          countryId,
          status,
          driverLabel,
        };
      }),
    );
    return jsonWithIds({ ...result, items }, ctx);
  } catch (error) {
    return financeReportingApiErrorResponse(error);
  }
}
