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
import { listProductionLandmarksApi } from "@/application/production-read/ProductionGeographyApiReads";
import { ScopeDeniedError } from "@/infrastructure/production/repositories/productionReadHelpers";

/** Bound WIF stream collection + mapping under Production preflight load. */
export const maxDuration = 60;

/**
 * GET /api/geography/landmarks — WIF-native Production landmarks (Legacy mkan).
 */
export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  if (productionReadPathActive()) {
    try {
      const ctx = await resolveApiActor(request);
      const result = await listProductionLandmarksApi(ctx, request);
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
