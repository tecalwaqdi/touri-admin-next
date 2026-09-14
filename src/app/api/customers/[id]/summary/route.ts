import { NextResponse } from "next/server";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  productionReadDisabledResponse,
} from "@/infrastructure/http/shadowApi";

/**
 * GET /api/customers/:id/summary — shadow-capable.
 * Production path disabled; no Production repository used.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  void context;
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  if (productionReadPathActive()) {
    return productionReadDisabledResponse();
  }

  return NextResponse.json({
    data: null,
    synthetic: true,
    sourceEnvironment: "synthetic",
    sourceSystem: "admin_next_synthetic",
    readMode: "synthetic",
    note: "Customer summary Production read not enabled",
  });
}
