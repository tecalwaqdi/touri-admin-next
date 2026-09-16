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
import {
  getFleetCompany,
  listFleetCompanies,
} from "@/application/production-read/P0CatalogApiReads";

/** GET /api/fleet — transport_company master. */
export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  if (!productionReadPathActive()) return productionReadDisabledResponse();
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:read");
    const url = new URL(request.url);
    const client = await getCatalogReadClient(ctx);
    const result = await listFleetCompanies(client, {
      limit: Number(url.searchParams.get("limit") ?? 20),
      cursor: url.searchParams.get("cursor"),
    });
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
