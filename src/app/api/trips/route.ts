import { NextResponse } from "next/server";
import { getRepositories } from "@/repositories/container";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  productionReadDisabledResponse,
} from "@/infrastructure/http/shadowApi";

/**
 * GET /api/trips — shadow-capable.
 * Production path remains DISABLED (returns 503 when flags would activate
 * without a live container). Synthetic path used in development.
 */
export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  // Production read path prepared but not activatable without enable + credentials
  if (productionReadPathActive()) {
    return productionReadDisabledResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "10");
    const status = searchParams.get("status") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const countryId = searchParams.get("countryId") ?? undefined;
    const result = await getRepositories().trips.list({
      page,
      pageSize,
      status,
      search,
      countryId,
    });
    return NextResponse.json(result);
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
