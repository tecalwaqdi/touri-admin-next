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
import { listProductionDriversApi } from "@/application/production-read/ProductionOperationalApiReads";

export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  if (productionReadPathActive()) {
    try {
      const ctx = await resolveApiActor(request);
      await requirePermission(ctx, "drivers:read");
      const { searchParams } = new URL(request.url);
      const result = await listProductionDriversApi(ctx, {
        pageSize: Number(searchParams.get("pageSize") ?? "20"),
        cursor: searchParams.get("cursor"),
        countryId: searchParams.get("countryId") ?? undefined,
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
          { error: error.message, code: error.code },
          { status: 403 },
        );
      }
      return mapProductionReadError(error);
    }
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "10");
    const search = searchParams.get("search") ?? undefined;
    const countryId = searchParams.get("countryId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const result = await getRepositories().drivers.list({
      page,
      pageSize,
      search,
      countryId,
      status,
    });
    return NextResponse.json({
      ...result,
      synthetic: true,
      sourceEnvironment: "synthetic",
      sourceSystem: "admin_next_synthetic",
      readMode: "synthetic",
      label: "development_synthetic",
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  return NextResponse.json(
    { error: "PRODUCTION_WRITE_DISABLED", code: "PRODUCTION_WRITE_DISABLED" },
    { status: 403 },
  );
}
