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
import { getProductionCountryDetailApi } from "@/application/production-read/ProductionGeographyApiReads";
import { ProductionDetailNotFoundError } from "@/application/production-read/detailDtos";
import { ScopeDeniedError } from "@/infrastructure/production/repositories/productionReadHelpers";

/** GET /api/geography/countries/[id] — WIF-native country detail (read-only). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  if (!productionReadPathActive()) return productionReadDisabledResponse();

  try {
    const ctx = await resolveApiActor(request);
    const { id } = await context.params;
    const detail = await getProductionCountryDetailApi(ctx, id);
    return jsonWithIds(detail, ctx);
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
    if (error instanceof ProductionDetailNotFoundError) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return mapProductionReadError(error);
  }
}
