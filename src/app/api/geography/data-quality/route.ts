import { NextResponse } from "next/server";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  productionReadDisabledResponse,
  mapProductionReadError,
} from "@/infrastructure/http/shadowApi";
import {
  resolveApiActor,
  UnauthorizedError,
  jsonWithIds,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getProductionGeographyDqSummaryApi } from "@/application/production-read/ProductionGeographyApiReads";
import { ScopeDeniedError } from "@/infrastructure/production/repositories/productionReadHelpers";

/**
 * GET /api/geography/data-quality — bounded_sample DQ summary (read-only).
 */
export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  if (productionReadPathActive()) {
    try {
      const ctx = await resolveApiActor(request);
      const result = await getProductionGeographyDqSummaryApi(ctx);
      return jsonWithIds(result, ctx);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 401 },
        );
      }
      if (
        error instanceof AuthorizationError ||
        error instanceof ScopeDeniedError
      ) {
        return NextResponse.json(
          {
            error: error instanceof Error ? error.message : "Forbidden",
            code: "FORBIDDEN",
          },
          { status: 403 },
        );
      }
      return mapProductionReadError(error);
    }
  }

  return productionReadDisabledResponse();
}
