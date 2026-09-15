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
import { getProductionAgentDetailApi } from "@/application/production-read/ProductionOperationalDetailReads";
import { ProductionDetailNotFoundError } from "@/application/production-read/detailDtos";

/**
 * GET /api/agents/[id]
 * Production: WIF-native exact getById + bounded related reads (≤20).
 * FR7 finance summary attached only when linkable (finance:read).
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
      await requirePermission(ctx, "agents:read");
      const { id } = await context.params;
      const detail = await getProductionAgentDetailApi(ctx, id);
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
      if (error instanceof ProductionDetailNotFoundError) {
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
    const agent = await repos.agents.getById(id);
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { searchParams } = new URL(request.url);
    if (searchParams.get("include") === "history") {
      const history = await repos.agents.listAssignmentHistory(agent.countryId);
      return NextResponse.json({
        ...agent,
        history,
        synthetic: true,
        label: "development_synthetic",
      });
    }
    return NextResponse.json({
      ...agent,
      synthetic: true,
      label: "development_synthetic",
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}
