import { NextResponse } from "next/server";
import { getRepositories } from "@/repositories/container";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  mapProductionReadError,
} from "@/infrastructure/http/shadowApi";
import {
  resolveApiActor,
  requirePermission,
  UnauthorizedError,
  jsonWithIds,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getProductionDriverDetailApi } from "@/application/production-read/ProductionOperationalDetailReads";
import { ProductionDetailNotFoundError } from "@/application/production-read/detailDtos";

/**
 * GET /api/drivers/[id]
 * Production: WIF-native exact getById (no Admin ADC, no synthetic fallback).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  if (productionReadPathActive()) {
    try {
      const ctx = await resolveApiActor(request);
      await requirePermission(ctx, "drivers:read");
      const { id } = await context.params;
      const detail = await getProductionDriverDetailApi(ctx, id);
      return jsonWithIds(detail, ctx);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 401 },
        );
      }
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
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

  try {
    const { id } = await context.params;
    const driver = await getRepositories().drivers.getById(id);
    if (!driver) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...driver,
      synthetic: true,
      label: "development_synthetic",
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}
