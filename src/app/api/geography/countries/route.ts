import { NextResponse } from "next/server";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  productionReadDisabledResponse,
} from "@/infrastructure/http/shadowApi";
import { getRepositories } from "@/repositories/container";
import { CountriesReadService } from "@/application/geography/CountriesReadService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";

/**
 * GET /api/geography/countries
 * Synthetic countries derived from agents (1 active agent / country).
 * Production path remains gated — no generic Production query API.
 */
export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  if (productionReadPathActive()) {
    return productionReadDisabledResponse();
  }

  try {
    const service = new CountriesReadService(getRepositories().agents);
    const result = await service.list();
    return NextResponse.json({
      ...result,
      nextCursor: null,
      truncated: false,
      sourceEnvironment: "synthetic",
      sourceSystem: "admin_next_synthetic",
      readMode: "synthetic",
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}
