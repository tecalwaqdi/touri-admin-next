import { NextResponse } from "next/server";
import { getDashboardService } from "@/application/services";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const metrics = await getDashboardService().getMetrics({
      fromUtc: searchParams.get("from") ?? undefined,
      toUtc: searchParams.get("to") ?? undefined,
      countryId: searchParams.get("countryId") ?? undefined,
      currencyCode: searchParams.get("currencyCode") ?? undefined,
    });
    return NextResponse.json(metrics);
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}
