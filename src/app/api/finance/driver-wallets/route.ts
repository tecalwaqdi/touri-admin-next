import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
} from "@/infrastructure/http/apiAuth";
import { getDriverWalletReadService } from "@/application/finance/wallet/DriverWalletReadService";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";
import { resolveHumanOperationalDisplayName } from "@/domain/presentation/operationalDisplayName";
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
          resolveHumanOperationalDisplayName({
            displayName: item.driverDisplayName,
            id: item.driverId,
          }) || null;
        let driverId = item.driverId;
        let countryId = item.countryId;
        let status = item.status;

        // Canonical driver docs are often keyed by the same id as the wallet doc
        // when wallet.driverId is absent — try driverId, then walletId.
        const lookupIds = [item.driverId, item.walletId]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i);

        if (runtime && readCtx) {
          for (const lookupId of lookupIds) {
            try {
              const env = await runtime.repos.drivers.getById(
                readCtx,
                lookupId,
              );
              if (!env) continue;
              const human = resolveHumanOperationalDisplayName({
                displayName: env.data.displayName.value,
                id: env.data.id,
              });
              if (human) driverLabel = human;
              if (!driverId) {
                driverId = env.data.id;
              }
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
              break;
            } catch {
              // fail-soft enrichment
            }
          }
        }

        return {
          ...item,
          driverId,
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
