import { NextResponse } from "next/server";
import { getRepositories } from "@/repositories/container";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { toFinancialTripDto } from "@/domain/finance/serializeFinancialTrip";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  productionReadDisabledResponse,
} from "@/infrastructure/http/shadowApi";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  if (productionReadPathActive()) {
    return productionReadDisabledResponse();
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
