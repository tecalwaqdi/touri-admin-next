import { NextResponse } from "next/server";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  productionReadDisabledResponse,
} from "@/infrastructure/http/shadowApi";

/**
 * GET /api/geography/cities — shadow-capable.
 * Production path disabled.
 */
export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  if (productionReadPathActive()) {
    return productionReadDisabledResponse();
  }

  return NextResponse.json({
    items: [],
    nextCursor: null,
    truncated: false,
    synthetic: true,
    sourceEnvironment: "synthetic",
    sourceSystem: "admin_next_synthetic",
    readMode: "synthetic",
    note: "Production geography read not enabled — empty development stub",
  });
}
