import { NextResponse } from "next/server";
import { getRepositories } from "@/repositories/container";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { toFinancialTripDto } from "@/domain/finance/serializeFinancialTrip";
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
import { getProductionTripDetailApi } from "@/application/production-read/ProductionOperationalDetailReads";
import { ProductionDetailNotFoundError } from "@/application/production-read/detailDtos";

/**
 * GET /api/trips/[id]
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
      await requirePermission(ctx, "trips:read");
      const { id } = await context.params;
      const detail = await getProductionTripDetailApi(ctx, id);
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
      if (
        error instanceof ProductionDetailNotFoundError ||
        (error &&
          typeof error === "object" &&
          "code" in error &&
          String((error as { code: unknown }).code) === "NOT_FOUND")
      ) {
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
    const repos = getRepositories();
    const trip = await repos.trips.getById(id);
    if (!trip) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const closed = await repos.settlements.findClosedContainingTrip(id);
    const financial = repos.financialCalculation.calculateFromTrip(
      trip,
      closed?.id ?? null,
    );
    return NextResponse.json({
      trip,
      financial: toFinancialTripDto(financial),
      synthetic: true,
      label: "development_synthetic",
      sections: [
        "overview",
        "parties",
        "status",
        "payment",
        "financial",
        "settlement_eligibility",
        "audit_placeholder",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}
