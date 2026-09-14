import { NextResponse } from "next/server";
import { getDashboardService } from "@/application/services";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import {
  productionReadPathActive,
  mapProductionReadError,
} from "@/infrastructure/http/shadowApi";
import {
  resolveApiActor,
  UnauthorizedError,
  jsonWithIds,
} from "@/infrastructure/http/apiAuth";
import { getProductionDashboardMetrics } from "@/application/production-read/ProductionOperationalApiReads";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import { getEnv } from "@/config/env";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = {
    fromUtc: searchParams.get("from") ?? undefined,
    toUtc: searchParams.get("to") ?? undefined,
    countryId: searchParams.get("countryId") ?? undefined,
    currencyCode: searchParams.get("currencyCode") ?? undefined,
  };

  if (productionReadPathActive()) {
    try {
      const ctx = await resolveApiActor(request);
      const metrics = await getProductionDashboardMetrics(ctx, filters);
      return jsonWithIds(metrics, ctx);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 401 },
        );
      }
      // Fail closed — never substitute synthetic dashboard in Production.
      const mapped = mapProductionReadError(error);
      if (mapped.status === 500) {
        return NextResponse.json(
          {
            totalTrips: null,
            completedTrips: null,
            cancelledTrips: null,
            activeDrivers: null,
            customers: null,
            pendingDrivers: null,
            cashCollected: null,
            onlineCollected: null,
            platformCommission: null,
            currencyCode: null,
            filters,
            synthetic: false,
            metricsAvailability: "unavailable",
            sourceLabel: resolveAdminDataSourceLabel({ unavailable: true }),
            error: "Production dashboard unavailable",
            code: "PRODUCTION_DATA_UNAVAILABLE",
          },
          { status: 503 },
        );
      }
      return mapped;
    }
  }

  try {
    const env = getEnv();
    if (env.APP_ENV === "production" || env.APP_ENV === "staging") {
      return NextResponse.json(
        {
          totalTrips: null,
          completedTrips: null,
          cancelledTrips: null,
          activeDrivers: null,
          customers: null,
          pendingDrivers: null,
          cashCollected: null,
          onlineCollected: null,
          platformCommission: null,
          currencyCode: null,
          filters,
          synthetic: false,
          metricsAvailability: "unavailable",
          sourceLabel: resolveAdminDataSourceLabel({ unavailable: true }),
          error: "Production dashboard requires PRODUCTION_READ_ENABLED",
          code: "PRODUCTION_READ_DISABLED",
        },
        { status: 503 },
      );
    }
    const metrics = await getDashboardService().getMetrics(filters);
    return NextResponse.json({
      ...metrics,
      sourceLabel: resolveAdminDataSourceLabel({ syntheticSource: true }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}
