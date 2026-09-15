import { NextResponse } from "next/server";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  mapProductionReadError,
} from "@/infrastructure/http/shadowApi";
import { getRepositories } from "@/repositories/container";
import { CountriesReadService } from "@/application/geography/CountriesReadService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import {
  resolveApiActor,
  UnauthorizedError,
  jsonWithIds,
} from "@/infrastructure/http/apiAuth";
import { listProductionCountriesApi } from "@/application/production-read/ProductionGeographyApiReads";

/**
 * GET /api/geography/countries
 * Production: WIF-native countries + agents (one-country-one-agent invariant).
 * Dev: synthetic countries derived from in-memory agents.
 */
export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  if (productionReadPathActive()) {
    try {
      const ctx = await resolveApiActor(request);
      const result = await listProductionCountriesApi(ctx, request);
      return jsonWithIds(result, ctx);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 401 },
        );
      }
      return mapProductionReadError(error);
    }
  }

  try {
    const service = new CountriesReadService(getRepositories().agents);
    const result = await service.list();
    return NextResponse.json({
      ...result,
      nextCursor: null,
      truncated: false,
      sourceEnvironment: "synthetic",
      sourceSystem: "admin_next_synthetic",
      readMode: "synthetic",
      label: "development_synthetic",
      en: "Development synthetic",
      ar: "بيانات تطوير اصطناعية",
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}
