import { NextResponse } from "next/server";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  productionReadDisabledResponse,
  mapProductionReadError,
} from "@/infrastructure/http/shadowApi";
import {
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
  jsonWithIds,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getCatalogReadClient } from "@/application/production-read/getCatalogReadClient";
import { getFleetCompany } from "@/application/production-read/P0CatalogApiReads";

/** GET /api/fleet/[id] */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  if (!productionReadPathActive()) return productionReadDisabledResponse();
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:read");
    const { id } = await context.params;
    const client = await getCatalogReadClient(ctx);
    const result = await getFleetCompany(client, id);
    if (!result) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return jsonWithIds(result, ctx);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    return mapProductionReadError(error);
  }
}
